<script>
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { club, squad, bench, skills, seasonData, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { LEGACY_TIERS, getEffectiveStats, getEffectiveRating, getEra, TIER_COLORS } from '../../utils/cards.js';
    import { calcCoachBonus, calcRegionChem, calcEraChem, calcTeamChem, calcLegacyBonus } from '../../utils/combat.js';
    import { STAT_META, STAT_ORDER } from '../match/matchMath.js';

    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const ALL_SLOTS = [...ROLES, 'COACH'];
    const FORMATION = [['TOP'], ['JNG', 'MID'], ['ADC', 'SUP']];
    const ROLE_NAMES = { TOP: 'Top', JNG: 'Jungle', MID: 'Mid', ADC: 'Bot', SUP: 'Support', COACH: 'Coach' };
    $: benchLevel = $skills.bench || 0;
    $: safeBench = Array.isArray($bench) ? $bench : [null, null, null];
    $: splitActive = (($seasonData.opponents || []).length > 0 && ($seasonData.matchResults || []).filter(r => r === true || r === false).length < 10);
    const roleIcons = { TOP:'/icons/Top_icon.png', JNG:'/icons/Jungle_icon.png', MID:'/icons/Middle_icon.png', ADC:'/icons/Bottom_icon.png', SUP:'/icons/Support_icon.png', COACH:'/icons/Specialist_icon.png' };

    let pickerOpen = false, pickerRole = null, pickerSearch = '', pickerEra = 'ALL';

    const ERA_OPTIONS = [
        { value: 1, label: 'Era 1 (2013 & earlier)' },
        { value: 2, label: 'Era 2 (2014-2016)' },
        { value: 3, label: 'Era 3 (2017-2019)' },
        { value: 4, label: 'Era 4 (2020-2022)' },
        { value: 5, label: 'Era 5 (2023-2025)' },
        { value: 6, label: 'Era 6 (2026+)' },
    ];

    // The same formulas every match uses (utils/combat.js), so the number shown here is the
    // number a match is played with.
    $: starters = ROLES.map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s,c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: coachBonus = calcCoachBonus($squad.COACH);
    $: regionChem = squadReady ? calcRegionChem(starters) : 0;
    $: eraChem = squadReady ? calcEraChem(starters) : 0;
    $: teamChem = squadReady ? calcTeamChem(starters) : 0;
    $: legacyBonus = calcLegacyBonus(starters);
    $: conditioningBonus = $skills.conditioning || 0;
    $: totalPower = squadReady ? avgRating+regionChem+eraChem+teamChem+coachBonus+legacyBonus+conditioningBonus : 0;
    $: tacticsLevel = $skills.tactics || 0;

    // --- Analytics ---
    $: nonLegacy = starters.filter(c => !LEGACY_TIERS.includes(c.quality));
    $: regionCount = new Set(nonLegacy.map(c => c.region)).size;
    $: eraCount = new Set(nonLegacy.map(c => getEra(c.year))).size;
    $: legacyCount = starters.length - nonLegacy.length;
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    $: breakdown = [
        { label: 'Region synergy', val: regionChem, max: 5,
          hint: !nonLegacy.length ? 'Legacy cards fit any region' : `${plural(regionCount, 'region')} in your five · one region = +5` },
        { label: 'Era synergy', val: eraChem, max: 5,
          hint: !nonLegacy.length ? 'Legacy cards fit any era' : `${plural(eraCount, 'era')} in your five · one era = +5` },
        { label: 'Same team', val: teamChem, max: 2,
          hint: teamChem ? 'Your five share a team' : 'All five from one team = +2' },
        { label: 'Coach', val: coachBonus, max: 5,
          hint: $squad.COACH ? `${$squad.COACH.name} · ${$squad.COACH.rating} rated (98+ = +5)` : 'No coach — a coach adds up to +5' },
        { label: 'Legacy cards', val: legacyBonus, max: 2,
          hint: `${plural(legacyCount, 'legacy card')} · 2 = +1, 4 = +2` },
        { label: 'Conditioning', val: conditioningBonus, max: 5, hint: 'Skill — raise it in Skills' },
    ];
    // What each play is resolved with in a match: effective stats (signature/holo bonus) plus Tactics.
    $: matchStats = squadReady ? STAT_ORDER.map(s => ({ s, v: Math.round(starters.reduce((a, c) => a + (getEffectiveStats(c)[s] || 0), 0) / starters.length) + tacticsLevel })) : [];
    $: statMax = Math.max(100, ...matchStats.map(m => m.v));
    $: bestStat = matchStats.length ? matchStats.reduce((a, b) => (b.v > a.v ? b : a)) : null;

    const isFlex = (card, role) => !!card && role !== 'COACH' && card.role !== role;

    // Everything eligible for the open slot, before search/era — the era dropdown reads its options
    // from here so they don't shift as the other filters change.
    $: pickerBase = (() => {
        if (!pickerRole) return [];
        const used = new Set(ALL_SLOTS.filter(r => r !== pickerRole).map(r => $squad[r]?.uniqueId).filter(Boolean));
        let pool = $club.filter(c => !used.has(c.uniqueId));
        if (pickerRole === 'COACH') pool = pool.filter(c => c.role === 'COACH');
        else pool = pool.filter(c => c.role !== 'COACH' && (c.role === pickerRole || LEGACY_TIERS.includes(c.quality)));
        pool.sort((a,b) => { const ag=a.role===pickerRole?0:1, bg=b.role===pickerRole?0:1; return ag!==bg?ag-bg:b.rating-a.rating; });
        return pool;
    })();
    $: pickerEraOptions = ERA_OPTIONS.filter(e => pickerBase.some(c => getEra(c.year) === e.value));
    $: pickerPool = (() => {
        let pool = pickerBase;
        if (pickerSearch) { const q=pickerSearch.toLowerCase(); pool=pool.filter(c=>c.name.toLowerCase().includes(q)||c.team.toLowerCase().includes(q)||String(c.year||'').includes(q)); }
        if (pickerEra !== 'ALL') pool = pool.filter(c => getEra(c.year) === pickerEra);
        return pool;
    })();

    $: currentSlotCard = pickerRole ? $squad[pickerRole] : null;

    function statDiff(candidate, current) {
        if (!current || !current.stats || !candidate.stats) return null;
        const diff = totalStats(candidate) - totalStats(current);
        return diff;
    }

    function perStatDiff(candidate, current) {
        if (!current || !current.stats || !candidate.stats) return [];
        return ['mec','tmf','frm','cmp','map','ldr'].map(s => ({
            key: s.toUpperCase(),
            val: (candidate.stats[s]||0) - (current.stats[s]||0)
        }));
    }

    function openPicker(role) {
        if (splitActive) { showToast('Squad is locked during an active split. Use bench swaps only.', 'error'); return; }
        pickerRole=role; pickerSearch=''; pickerEra='ALL'; pickerOpen=true;
    }
    function closePicker() { pickerOpen=false; pickerRole=null; }
    function assignCard(card) { squad.update(s=>({...s,[pickerRole]:card})); closePicker(); saveGame(); }
    function removeCard(role) {
        if (splitActive) { showToast('Squad is locked during an active split.', 'error'); return; }
        squad.update(s=>({...s,[role]:null})); saveGame();
    }
    function totalStats(c) {
        const s = getEffectiveStats(c);
        return (s.mec||0)+(s.tmf||0)+(s.frm||0)+(s.cmp||0)+(s.map||0)+(s.ldr||0);
    }
    function autofill() {
        if (splitActive) { showToast('Squad is locked during an active split.', 'error'); return; }
        const s = { COACH: null, TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
        const used = new Set();
        ROLES.forEach(role => {
            const best = $club.filter(c => c.role === role && !used.has(c.uniqueId)).sort((a,b) => totalStats(b) - totalStats(a))[0]
                || $club.filter(c => LEGACY_TIERS.includes(c.quality) && !used.has(c.uniqueId)).sort((a,b) => totalStats(b) - totalStats(a))[0];
            if (best) { s[role] = best; used.add(best.uniqueId); }
        });
        const bestCoach = $club.filter(c => c.role === 'COACH' && !used.has(c.uniqueId)).sort((a,b) => totalStats(b) - totalStats(a))[0];
        if (bestCoach) s.COACH = bestCoach;
        squad.set(s); saveGame(); showToast('Squad filled with best total stats.', 'success');
    }
    function disband() {
        if (splitActive) { showToast('Squad is locked during an active split.', 'error'); return; }
        if (!ALL_SLOTS.some(r => $squad[r])) return;
        openConfirmModal('Clear all six squad slots? The cards stay in your club.', () => {
            squad.set({COACH:null,TOP:null,JNG:null,MID:null,ADC:null,SUP:null}); saveGame();
        });
    }

    let benchPickerOpen = false;
    let benchPickerIdx = null;
    let benchSearch = '';
    let benchRoleFilter = 'ALL';
    let benchEra = 'ALL';
    let benchSort = 'rating';
    const BENCH_ROLES = ['ALL', 'TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const BENCH_SORTS = [['rating','RTG'], ['mec','MEC'], ['tmf','TMF'], ['frm','FRM'], ['cmp','CMP'], ['map','MAP'], ['ldr','LDR']];

    $: benchUsedIds = new Set([
        ...Object.values($squad).filter(Boolean).map(c => c.uniqueId),
        ...(Array.isArray($bench) ? $bench : []).filter(Boolean).map(c => c.uniqueId)
    ]);

    $: benchPickerBase = benchPickerIdx === null ? [] : $club.filter(c => c.role !== 'COACH' && !benchUsedIds.has(c.uniqueId));
    $: benchEraOptions = ERA_OPTIONS.filter(e => benchPickerBase.some(c => getEra(c.year) === e.value));
    $: benchPickerPool = (() => {
        if (benchPickerIdx === null) return [];
        let pool = benchPickerBase;
        if (benchRoleFilter !== 'ALL') pool = pool.filter(c => c.role === benchRoleFilter);
        if (benchEra !== 'ALL') pool = pool.filter(c => getEra(c.year) === benchEra);
        if (benchSearch) { const q = benchSearch.toLowerCase(); pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q) || String(c.year || '').includes(q)); }
        const val = c => benchSort === 'rating' ? getEffectiveRating(c) : (getEffectiveStats(c)[benchSort] || 0);
        return pool.slice().sort((a, b) => val(b) - val(a));
    })();

    function openBenchPicker(idx) {
        if (splitActive) { showToast('Bench is locked during an active split. Use the swap buttons below.', 'error'); return; }
        benchPickerIdx = idx; benchSearch = ''; benchRoleFilter = 'ALL'; benchEra = 'ALL'; benchSort = 'rating'; benchPickerOpen = true;
    }
    function closeBenchPicker() { benchPickerOpen = false; benchPickerIdx = null; }
    function assignBench(card) {
        bench.update(b => { const n = [...b]; n[benchPickerIdx] = card; return n; });
        closeBenchPicker();
        saveGame();
    }
    function removeBench(idx) {
        if (splitActive) { showToast('Bench is locked during an active split.', 'error'); return; }
        bench.update(b => { const n = [...b]; n[idx] = null; return n; });
        saveGame();
    }

    let swapMode = false;
    let swapBenchIdx = null;

    function startSwap(benchIdx) {
        swapBenchIdx = benchIdx;
        swapMode = true;
    }
    function executeSwap(role) {
        if (swapBenchIdx === null) return;
        const currentStarter = $squad[role];
        const benchCard = safeBench[swapBenchIdx];
        if (!benchCard) return;
        squad.update(s => ({ ...s, [role]: benchCard }));
        bench.update(b => { const n = [...b]; n[swapBenchIdx] = currentStarter; return n; });
        swapMode = false;
        swapBenchIdx = null;
        saveGame();
        showToast(`Swapped ${benchCard.name} into ${role}. ${currentStarter ? currentStarter.name + ' moved to bench.' : ''}`, 'success');
    }
    function cancelSwap() { swapMode = false; swapBenchIdx = null; }
    function slotClick(role) { swapMode ? executeSwap(role) : openPicker(role); }
    function benchClick(idx) {
        if (splitActive) { if (safeBench[idx]) startSwap(idx); else showToast('Bench is locked during an active split.', 'error'); }
        else openBenchPicker(idx);
    }
    function onKey(e) {
        if (e.key !== 'Escape') return;
        if (pickerOpen) closePicker();
        else if (benchPickerOpen) closeBenchPicker();
        else if (swapMode) cancelSwap();
    }
</script>

<svelte:window on:keydown={onKey} />

<section class="sq">
    <!-- ═══ Hero ═══ -->
    <header class="sqh">
        <div class="sqh-glow" aria-hidden="true"></div>
        <div class="sqh-power" class:sqh-power-off={!squadReady}>
            <span class="sp-n">{squadReady ? totalPower : '—'}</span>
            <span class="sp-l">Power</span>
        </div>
        <div class="sqh-text">
            <span class="sqh-eyebrow"><Icon name="squad" size={12} stroke={2.2} /> Squad</span>
            <h2 class="sqh-title">Squad Builder</h2>
            <p class="sqh-sub">
                {#if squadReady}Rating {avgRating} + {totalPower - avgRating} from chemistry, coach and skills. Power decides every match you play.
                {:else}Fill all five positions to play — {5 - starters.length} still empty.{/if}
            </p>
        </div>
        <div class="sqh-side">
            <div class="sqh-chips">
                <span class="hc"><b>{starters.length}</b>/5 starters</span>
                <span class="hc"><b>{$squad.COACH ? 1 : 0}</b>/1 coach</span>
                <span class="hc"><b>{safeBench.slice(0, benchLevel).filter(Boolean).length}</b>/{benchLevel} bench</span>
            </div>
            {#if !splitActive}
                <div class="sqh-actions">
                    <button class="act act-primary" on:click={autofill} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name="sparkle" size={15} stroke={2.2} /> Auto fill</button>
                    <button class="act act-ghost" on:click={disband}>Disband</button>
                </div>
            {/if}
        </div>
    </header>

    {#if splitActive}
        <div class="banner banner-lock">
            <span class="bn-ico"><Icon name="lock" size={16} stroke={2.2} /></span>
            <span class="bn-text"><b>Squad locked — a season split is in progress.</b> {safeBench.filter(Boolean).length > 0 ? 'Click a bench player, then the starter they replace.' : 'Add bench players before your next split to be able to swap mid-split.'}</span>
        </div>
    {/if}
    {#if swapMode}
        <div class="banner banner-swap">
            <span class="bn-ico"><Icon name="trade" size={16} stroke={2.2} /></span>
            <span class="bn-text">Pick the starter to swap with <b>{safeBench[swapBenchIdx]?.name || 'your bench player'}</b>.</span>
            <button class="bn-btn" on:click={cancelSwap}>Cancel</button>
        </div>
    {/if}

    <div class="sq-grid">
        <!-- ═══ Left: Coach + Bench ═══ -->
        <aside class="panel sq-side">
            <div class="p-head"><span class="p-ico p-ico-coach"><Icon name="academy" size={15} /></span><span class="p-title">Coach</span><span class="p-note">{coachBonus ? `+${coachBonus} power` : 'up to +5'}</span></div>
            <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="slot slot-coach" on:click={() => openPicker('COACH')}>
                {#if $squad.COACH}
                    <Card card={$squad.COACH} mini={true} onclick={() => openPicker('COACH')} />
                    {#if !splitActive}<button class="rm" aria-label="Remove coach" on:click|stopPropagation={() => removeCard('COACH')}><Icon name="close" size={11} stroke={2.8} /></button>{/if}
                {:else}
                    <div class="empty empty-coach">
                        <span class="empty-ring empty-ring-coach"><img src={roleIcons.COACH} alt="" class="empty-icon"></span>
                        <span class="empty-role">Add a coach</span>
                    </div>
                {/if}
            </div>

            <div class="p-head p-head-bench"><span class="p-ico p-ico-bench"><Icon name="trade" size={15} /></span><span class="p-title">Bench</span><span class="p-note">{benchLevel}/3 unlocked</span></div>
            <div class="bench">
                {#each [0, 1, 2] as idx}
                    {#if idx < benchLevel}
                        {@const b = safeBench[idx]}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="bn-row" class:bn-filled={b} class:bn-swapping={swapMode && swapBenchIdx === idx} class:bn-can-swap={splitActive && b} on:click={() => benchClick(idx)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); benchClick(idx); } }} role="button" tabindex="0">
                            {#if b}
                                <span class="bn-tier" style="--t: {TIER_COLORS[b.quality] || '#64748b'};"></span>
                                <img src={roleIcons[b.role]} alt={b.role} class="bn-role">
                                <span class="bn-rating">{getEffectiveRating(b)}</span>
                                <span class="bn-info"><span class="bn-name">{b.name}</span><span class="bn-meta">{b.team} · {b.year} · {b.quality}</span></span>
                                {#if splitActive}
                                    <span class="bn-tag">Swap</span>
                                {:else}
                                    <button class="bn-rm" aria-label="Remove {b.name} from bench" on:click|stopPropagation={() => removeBench(idx)}><Icon name="close" size={11} stroke={2.8} /></button>
                                {/if}
                            {:else}
                                <span class="bn-empty-ico">{#if splitActive}<Icon name="lock" size={14} />{:else}<Icon name="squad" size={14} />{/if}</span>
                                <span class="bn-info"><span class="bn-name bn-name-dim">Bench {idx + 1}</span><span class="bn-meta">{splitActive ? 'Locked until the split ends' : 'Add a substitute'}</span></span>
                                {#if !splitActive}<span class="bn-add">+</span>{/if}
                            {/if}
                        </div>
                    {:else}
                        <div class="bn-row bn-locked">
                            <span class="bn-empty-ico"><Icon name="lock" size={14} /></span>
                            <span class="bn-info"><span class="bn-name bn-name-dim">Bench {idx + 1}</span><span class="bn-meta">Unlock with Bench Management</span></span>
                        </div>
                    {/if}
                {/each}
            </div>
            <p class="side-foot">Bench players can be swapped in during a split — the only squad change allowed once it starts.</p>
        </aside>

        <!-- ═══ Centre: the pitch ═══ -->
        <main class="panel pitch">
            <div class="pitch-bg" aria-hidden="true"><span class="river"></span><span class="lane lane-top"></span><span class="lane lane-bot"></span></div>
            <div class="p-head p-head-pitch"><span class="p-ico p-ico-start"><Icon name="flag" size={15} /></span><span class="p-title">Starting five</span><span class="p-note">{starters.length}/5</span></div>
            <div class="form">
                {#each FORMATION as row}
                    <div class="form-row">
                        {#each row as role}
                            {@const c = $squad[role]}
                            <div class="pos">
                                <span class="pos-tag" class:pos-tag-on={c}>
                                    <img src={roleIcons[role]} alt="">{ROLE_NAMES[role]}
                                    {#if isFlex(c, role)}<span class="pos-flex">Flex</span>{/if}
                                </span>
                                <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div class="slot" class:slot-swap-target={swapMode} on:click={() => slotClick(role)}>
                                    {#if c}
                                        <Card card={c} mini={true} onclick={() => slotClick(role)} />
                                        {#if !splitActive}<button class="rm" aria-label="Remove {c.name}" on:click|stopPropagation={() => removeCard(role)}><Icon name="close" size={11} stroke={2.8} /></button>{/if}
                                    {:else}
                                        <div class="empty">
                                            <span class="empty-ring"><img src={roleIcons[role]} alt="" class="empty-icon"></span>
                                            <span class="empty-role">Add {ROLE_NAMES[role]}</span>
                                            <span class="empty-hint">{splitActive ? 'Locked' : 'Click to pick'}</span>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/each}
            </div>
        </main>

        <!-- ═══ Right: Analytics ═══ -->
        <aside class="panel sq-stats">
            <div class="p-head"><span class="p-ico p-ico-stats"><Icon name="ranking" size={15} /></span><span class="p-title">Analytics</span></div>
            {#if !squadReady}
                <div class="stats-empty">
                    <Icon name="squad" size={26} />
                    <span>Fill all five positions to see your power and match stats.</span>
                </div>
            {:else}
                <div class="stat-pair">
                    <div class="stat-box"><span class="sb-n">{avgRating}</span><span class="sb-l">Rating</span></div>
                    <div class="stat-box stat-box-power"><span class="sb-n">{totalPower}</span><span class="sb-l">Power</span></div>
                </div>

                <div class="a-label">Power breakdown</div>
                <div class="bd-list">
                    {#each breakdown as r}
                        <div class="bd-row" class:bd-max={r.val >= r.max} class:bd-zero={r.val === 0}>
                            <div class="bd-top"><span class="bd-name">{r.label}</span><span class="bd-val">+{r.val}<span class="bd-max-n">/{r.max}</span></span></div>
                            <div class="bd-bar"><div class="bd-fill" style="width: {(r.val / r.max) * 100}%;"></div></div>
                            <div class="bd-hint">{r.hint}</div>
                        </div>
                    {/each}
                </div>
                <div class="formula">{avgRating} rating + {totalPower - avgRating} bonus = <b>{totalPower}</b></div>

                <div class="a-label">Match stats</div>
                <div class="ms-list">
                    {#each matchStats as m}
                        {@const meta = STAT_META[m.s]}
                        <div class="ms-row" style="--c: {meta.c};" class:ms-best={bestStat && m.s === bestStat.s}>
                            <span class="ms-ico"><Icon name={meta.icon} size={13} stroke={2.2} /></span>
                            <span class="ms-name">{meta.name}</span>
                            <div class="ms-bar"><div class="ms-fill" style="width: {(m.v / statMax) * 100}%;"></div></div>
                            <span class="ms-v">{m.v}</span>
                        </div>
                    {/each}
                </div>
                <p class="a-foot">Your five's average for each play{tacticsLevel ? `, including +${tacticsLevel} from Tactical Mastery` : ''}.{bestStat ? ` ${STAT_META[bestStat.s].name} is your strongest play.` : ''}</p>
            {/if}
        </aside>
    </div>
</section>

<!-- ═══ Picker ═══ -->
{#if pickerOpen}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pk-over">
    <div class="pk-bg" on:click={closePicker}></div>
    <div class="pk-panel" role="dialog" aria-label="Pick a {ROLE_NAMES[pickerRole]}">
        <div class="pk-head">
            <div class="pk-left">
                <span class="pk-role"><img src={roleIcons[pickerRole]} alt=""></span>
                <span class="pk-titles">
                    <span class="pk-title">{pickerRole === 'COACH' ? 'Pick a coach' : `Pick your ${ROLE_NAMES[pickerRole]}`}</span>
                    <span class="pk-ct">{pickerPool.length} eligible{pickerRole !== 'COACH' ? ' · legacy cards can play any role (Flex)' : ''}</span>
                </span>
            </div>
            <div class="pk-right">
                <label class="pk-search"><Icon name="search" size={14} stroke={2.2} /><input type="text" bind:value={pickerSearch} placeholder="Search name, team or year" aria-label="Search"></label>
                <select bind:value={pickerEra} class="pk-sel" aria-label="Era">
                    <option value="ALL">All eras</option>
                    {#each pickerEraOptions as e}<option value={e.value}>{e.label}</option>{/each}
                </select>
                <button class="pk-x" aria-label="Close" on:click={closePicker}><Icon name="close" size={14} stroke={2.6} /></button>
            </div>
        </div>
        {#if currentSlotCard}
            <div class="pk-current">Replacing <b>{currentSlotCard.name}</b> ({getEffectiveRating(currentSlotCard)}) — the numbers under each card compare it with them.</div>
        {/if}
        <div class="pk-body">
            {#if pickerPool.length===0}<div class="pk-empty">No eligible cards.</div>
            {:else}<div class="pk-grid">
                {#each pickerPool as card (card.uniqueId)}
                    {@const diff = statDiff(card, currentSlotCard)}
                    {@const perStat = perStatDiff(card, currentSlotCard)}
                    <div class="pk-wrap">
                        <Card {card} mini={true} onclick={() => assignCard(card)} />
                        {#if card.role!==pickerRole&&pickerRole!=='COACH'}<div class="pk-flex">Flex</div>{/if}
                        {#if currentSlotCard}
                            <div class="pk-compare">
                                <div class="pk-total" class:pk-pos={diff > 0} class:pk-neg={diff < 0} class:pk-neu={diff === 0}>
                                    {diff > 0 ? '+' : ''}{diff} total stats
                                </div>
                                <div class="pk-stats">
                                    {#each perStat as s}
                                        <span class="pk-sd" class:pk-pos={s.val > 0} class:pk-neg={s.val < 0}>
                                            {s.key} {s.val > 0 ? '+' : ''}{s.val}
                                        </span>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>{/if}
        </div>
    </div>
</div>
{/if}

<!-- ═══ Bench Picker ═══ -->
{#if benchPickerOpen}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pk-over">
    <div class="pk-bg" on:click={closeBenchPicker}></div>
    <div class="pk-panel" role="dialog" aria-label="Pick a bench player">
        <div class="pk-head">
            <div class="pk-left">
                <span class="pk-role pk-role-bench"><Icon name="trade" size={18} /></span>
                <span class="pk-titles">
                    <span class="pk-title">Bench slot {(benchPickerIdx || 0) + 1}</span>
                    <span class="pk-ct">{benchPickerPool.length} available</span>
                </span>
            </div>
            <div class="pk-right">
                <label class="pk-search"><Icon name="search" size={14} stroke={2.2} /><input type="text" bind:value={benchSearch} placeholder="Search name, team or year" aria-label="Search"></label>
                <select bind:value={benchEra} class="pk-sel" aria-label="Era">
                    <option value="ALL">All eras</option>
                    {#each benchEraOptions as e}<option value={e.value}>{e.label}</option>{/each}
                </select>
                <button class="pk-x" aria-label="Close" on:click={closeBenchPicker}><Icon name="close" size={14} stroke={2.6} /></button>
            </div>
        </div>
        <div class="pk-controls">
            <div class="pk-fgroup">
                <span class="pk-flbl">Role</span>
                {#each BENCH_ROLES as r}
                    <button class="pk-chip" class:pk-chip-on={benchRoleFilter===r} on:click={() => benchRoleFilter=r}>
                        {#if r !== 'ALL'}<img src={roleIcons[r]} alt="">{/if}{r === 'ALL' ? 'All' : r}
                    </button>
                {/each}
            </div>
            <div class="pk-fgroup">
                <span class="pk-flbl">Sort by</span>
                {#each BENCH_SORTS as [k, lbl]}
                    <button class="pk-chip pk-chip-sort" class:pk-chip-on={benchSort===k} on:click={() => benchSort=k}>{lbl}</button>
                {/each}
            </div>
        </div>
        <div class="pk-body">
            {#if benchPickerPool.length===0}<div class="pk-empty">No cards match these filters.</div>
            {:else}<div class="pk-grid">
                {#each benchPickerPool as card (card.uniqueId)}
                    <div class="pk-wrap">
                        <Card {card} mini={true} onclick={() => assignBench(card)} />
                        {#if benchSort !== 'rating'}<div class="pk-sortval">{benchSort.toUpperCase()} {getEffectiveStats(card)[benchSort]}</div>{/if}
                    </div>
                {/each}
            </div>{/if}
        </div>
    </div>
</div>
{/if}

<style>
    .sq { display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; max-width: 1400px; margin: 0 auto; }

    /* ── Hero ── */
    .sqh {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(52,211,153,0.15), transparent 65%), linear-gradient(120deg, #0a1714, #0b0e1a 60%);
        border: 1px solid rgba(52,211,153,0.25);
    }
    .sqh-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(96,165,250,0.12), transparent 65%); }
    .sqh-power {
        position: relative; width: 108px; height: 108px; flex-shrink: 0; border-radius: 30px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(circle at 35% 30%, rgba(52,211,153,0.35), rgba(6,78,59,0.55) 70%);
        border: 1px solid rgba(52,211,153,0.5); box-shadow: 0 0 0 6px rgba(52,211,153,0.08), 0 10px 30px rgba(16,185,129,0.25);
    }
    .sqh-power-off { background: rgba(15,23,42,0.6); border-color: rgba(71,85,105,0.4); box-shadow: none; }
    .sp-n { font-size: 38px; font-weight: 900; color: #ecfdf5; line-height: 1; font-variant-numeric: tabular-nums; }
    .sqh-power-off .sp-n { color: #475569; }
    .sp-l { font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #6ee7b7; margin-top: 4px; }
    .sqh-power-off .sp-l { color: #64748b; }
    .sqh-text { position: relative; flex: 1; min-width: 240px; }
    .sqh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #34d399; }
    .sqh-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .sqh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 520px; }
    .sqh-side { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    .sqh-chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .hc { padding: 6px 12px; border-radius: 100px; font-size: 12px; font-weight: 700; color: #94a3b8; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.15); }
    .hc b { color: #f1f5f9; font-weight: 900; }
    .sqh-actions { display: flex; gap: 8px; }
    .act { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 7px; padding: 11px 20px; border-radius: 13px; cursor: pointer; font-size: 13px; font-weight: 900; }
    .act-primary { color: #052e16; border: none; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 6px 20px rgba(16,185,129,0.35); }
    .act-primary:hover { transform: translateY(-1px); }
    .act-ghost { color: #e2e8f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
    .act-ghost:hover { background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.4); color: #fecaca; }

    /* ── Banners ── */
    .banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px; }
    .bn-ico { width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .bn-text { flex: 1; font-size: 13px; }
    .banner-lock { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); }
    .banner-lock .bn-ico { color: #1c1404; background: #fbbf24; }
    .banner-lock .bn-text { color: #fcd34d; }
    .banner-lock b { color: #fff; }
    .banner-swap { background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.45); animation: swapPulse 1.5s ease-in-out infinite; }
    .banner-swap .bn-ico { color: #042f2e; background: #2dd4bf; }
    .banner-swap .bn-text { color: #99f6e4; }
    .banner-swap b { color: #fff; }
    .bn-btn { padding: 7px 14px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 800; color: #e2e8f0; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.18); }
    .bn-btn:hover { background: rgba(0,0,0,0.5); }
    @keyframes swapPulse { 0%,100% { border-color: rgba(20,184,166,0.35); } 50% { border-color: rgba(20,184,166,0.8); } }

    /* ── Layout ── */
    .sq-grid { display: grid; grid-template-columns: 260px minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
    .panel { position: relative; padding: 16px; border-radius: 20px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .p-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
    .p-head-bench { margin-top: 18px; }
    .p-ico { width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .p-ico-coach { --c: #34d399; }
    .p-ico-bench { --c: #2dd4bf; }
    .p-ico-start { --c: #60a5fa; }
    .p-ico-stats { --c: #a78bfa; }
    .p-title { font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #e2e8f0; }
    .p-note { margin-left: auto; font-size: 11px; font-weight: 800; color: #64748b; }

    /* Side: coach + bench */
    .slot { position: relative; cursor: pointer; border-radius: 16px; }
    .slot-coach { display: flex; justify-content: center; }
    .bench { display: flex; flex-direction: column; gap: 6px; }
    .bn-row {
        position: relative; display: flex; align-items: center; gap: 9px; min-height: 52px; padding: 8px 10px 8px 12px; border-radius: 12px; cursor: pointer; overflow: hidden;
        background: rgba(15,23,42,0.6); border: 1px dashed rgba(71,85,105,0.45); transition: border-color 0.12s, background 0.12s;
    }
    .bn-row:hover { border-color: rgba(45,212,191,0.55); background: rgba(20,184,166,0.06); }
    .bn-filled { border-style: solid; border-color: rgba(71,85,105,0.35); }
    .bn-can-swap { border-color: rgba(45,212,191,0.45); }
    .bn-swapping { border-color: #2dd4bf !important; background: rgba(20,184,166,0.14) !important; box-shadow: 0 0 0 3px rgba(45,212,191,0.15); }
    .bn-locked { cursor: default; opacity: 0.55; }
    .bn-locked:hover { border-color: rgba(71,85,105,0.45); background: rgba(15,23,42,0.6); }
    .bn-tier { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--t); }
    .bn-role { width: 18px; height: 18px; opacity: 0.8; flex-shrink: 0; }
    .bn-rating { font-size: 18px; font-weight: 900; color: #f1f5f9; min-width: 26px; font-variant-numeric: tabular-nums; }
    .bn-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .bn-name { font-size: 13px; font-weight: 900; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bn-name-dim { color: #94a3b8; }
    .bn-meta { font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bn-empty-ico { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #64748b; background: rgba(51,65,85,0.3); flex-shrink: 0; }
    .bn-add { font-size: 18px; font-weight: 900; color: #2dd4bf; padding: 0 4px; }
    .bn-tag { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #042f2e; background: #2dd4bf; padding: 3px 8px; border-radius: 100px; }
    .bn-rm { width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #fca5a5; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); opacity: 0; transition: opacity 0.12s; }
    .bn-row:hover .bn-rm, .bn-rm:focus-visible { opacity: 1; }
    .bn-rm:hover { background: #b91c1c; color: #fff; }
    .side-foot { margin-top: 12px; font-size: 11px; color: #64748b; line-height: 1.5; }

    /* Pitch */
    .pitch { overflow: hidden; background: linear-gradient(180deg, rgba(10,28,26,0.85), rgba(10,14,26,0.85)); border-color: rgba(52,211,153,0.2); }
    .pitch-bg { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .river { position: absolute; left: -20%; right: -20%; top: 50%; height: 120px; transform: translateY(-50%) rotate(-24deg); background: linear-gradient(180deg, transparent, rgba(56,189,248,0.07) 30%, rgba(56,189,248,0.1) 50%, rgba(56,189,248,0.07) 70%, transparent); }
    .lane { position: absolute; border: 2px dashed rgba(148,163,184,0.045); border-radius: 30px; }
    .lane-top { left: 6%; top: 5%; width: 60%; height: 60%; border-right: none; border-bottom: none; }
    .lane-bot { right: 6%; bottom: 5%; width: 60%; height: 60%; border-left: none; border-top: none; }
    .p-head-pitch { position: relative; }
    .form { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 4px 0 6px; }
    .form-row { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
    .pos { display: flex; flex-direction: column; align-items: center; gap: 7px; }
    .pos-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px 4px 8px; border-radius: 100px; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.35); }
    .pos-tag img { width: 14px; height: 14px; opacity: 0.6; }
    .pos-tag-on { color: #cbd5e1; border-color: rgba(96,165,250,0.35); }
    .pos-tag-on img { opacity: 1; }
    .pos-flex { margin-left: 2px; padding: 1px 6px; border-radius: 6px; font-size: 9px; letter-spacing: 1px; color: #fff; background: #d97706; }
    .slot-swap-target { cursor: pointer; animation: swapTarget 1.4s ease-in-out infinite; }
    @keyframes swapTarget { 0%,100% { box-shadow: 0 0 0 3px rgba(45,212,191,0.25); } 50% { box-shadow: 0 0 0 5px rgba(45,212,191,0.6); } }

    .empty {
        width: 180px; height: 266px; border-radius: 16px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
        background: rgba(2,6,23,0.45); border: 2px dashed rgba(96,165,250,0.25); transition: border-color 0.12s, background 0.12s;
    }
    .empty:hover { border-color: rgba(96,165,250,0.6); background: rgba(30,58,138,0.2); }
    .empty-coach { border-color: rgba(52,211,153,0.25); }
    .empty-coach:hover { border-color: rgba(52,211,153,0.6); background: rgba(6,78,59,0.2); }
    .empty-ring { width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.25); margin-bottom: 4px; }
    .empty-ring-coach { background: rgba(52,211,153,0.08); border-color: rgba(52,211,153,0.25); }
    .empty-icon { width: 26px; height: 26px; opacity: 0.55; }
    .empty-role { font-size: 13px; font-weight: 900; color: #cbd5e1; }
    .empty-hint { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #475569; }
    .rm {
        position: absolute; top: 6px; right: 6px; z-index: 10;
        width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: #fecaca; background: rgba(2,6,23,0.85); border: 1px solid rgba(248,113,113,0.45);
        opacity: 0; transition: opacity 0.12s, background 0.12s;
    }
    .slot:hover .rm, .rm:focus-visible { opacity: 1; }
    .rm:hover { background: #b91c1c; color: #fff; }

    /* Analytics */
    .stats-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px 10px; text-align: center; font-size: 12px; color: #64748b; border-radius: 14px; border: 1px dashed rgba(71,85,105,0.4); }
    .stat-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .stat-box { display: flex; flex-direction: column; align-items: center; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.14); }
    .stat-box-power { border-color: rgba(52,211,153,0.35); background: radial-gradient(circle at 50% 0%, rgba(52,211,153,0.15), transparent 70%), rgba(2,6,23,0.5); }
    .sb-n { font-size: 28px; font-weight: 900; color: #e2e8f0; line-height: 1.05; font-variant-numeric: tabular-nums; }
    .stat-box-power .sb-n { color: #34d399; }
    .sb-l { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; margin-top: 2px; }
    .a-label { font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; margin: 4px 0 8px; }
    .bd-list { display: flex; flex-direction: column; gap: 6px; }
    .bd-row { padding: 8px 10px; border-radius: 11px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .bd-top { display: flex; justify-content: space-between; align-items: baseline; }
    .bd-name { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .bd-val { font-size: 14px; font-weight: 900; color: #34d399; font-variant-numeric: tabular-nums; }
    .bd-max-n { font-size: 10px; color: #475569; font-weight: 800; margin-left: 1px; }
    .bd-zero .bd-val { color: #64748b; }
    .bd-bar { height: 4px; border-radius: 4px; margin: 5px 0 4px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .bd-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #10b981, #6ee7b7); transition: width 0.4s; }
    .bd-max { border-color: rgba(52,211,153,0.3); }
    .bd-hint { font-size: 10.5px; color: #64748b; line-height: 1.35; }
    .formula { margin: 10px 0 16px; padding: 8px; border-radius: 10px; text-align: center; font-size: 12px; color: #64748b; background: rgba(2,6,23,0.4); }
    .formula b { color: #34d399; font-size: 14px; }
    .ms-list { display: flex; flex-direction: column; gap: 6px; }
    .ms-row { display: grid; grid-template-columns: auto 78px 1fr 30px; align-items: center; gap: 8px; }
    .ms-ico { width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .ms-name { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .ms-bar { height: 6px; border-radius: 6px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .ms-fill { height: 100%; border-radius: 6px; background: var(--c); }
    .ms-v { font-size: 13px; font-weight: 900; color: #f1f5f9; text-align: right; font-variant-numeric: tabular-nums; }
    .ms-best .ms-name { color: var(--c); }
    .a-foot { margin-top: 10px; font-size: 11px; color: #64748b; line-height: 1.5; }

    /* ── Pickers ── */
    .pk-over { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .pk-bg { position: absolute; inset: 0; background: rgba(0,0,0,.75); backdrop-filter: blur(8px); }
    .pk-panel {
        position: relative; width: 100%; max-width: 1100px; max-height: 86vh; display: flex; flex-direction: column;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%); border: 1px solid rgba(71,85,105,.3); border-radius: 22px;
        box-shadow: 0 25px 80px rgba(0,0,0,.6); animation: pkIn 0.22s cubic-bezier(.2,.8,.3,1) both;
    }
    @keyframes pkIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
    .pk-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 20px; border-bottom: 1px solid rgba(51,65,85,.25); }
    .pk-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .pk-role { width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(96,165,250,0.12); border: 1px solid rgba(96,165,250,0.35); color: #93c5fd; }
    .pk-role img { width: 22px; height: 22px; }
    .pk-role-bench { background: rgba(45,212,191,0.12); border-color: rgba(45,212,191,0.35); color: #5eead4; }
    .pk-titles { display: flex; flex-direction: column; min-width: 0; }
    .pk-title { font-size: 17px; font-weight: 900; color: #fff; }
    .pk-ct { font-size: 11px; color: #64748b; font-weight: 700; }
    .pk-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pk-search { display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 11px; border-radius: 11px; color: #64748b; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.35); }
    .pk-search:focus-within { border-color: rgba(96,165,250,0.6); color: #93c5fd; }
    .pk-search input { width: 180px; background: none; border: none; outline: none; color: #e2e8f0; font-size: 12px; font-weight: 600; }
    .pk-search input::placeholder { color: #475569; }
    .pk-sel {
        height: 36px; padding: 0 28px 0 11px; border-radius: 11px; cursor: pointer; appearance: none; -webkit-appearance: none;
        font-size: 12px; font-weight: 800; color: #cbd5e1; background-color: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.35);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 10px center;
    }
    .pk-sel option { background: #0f172a; }
    .pk-x { width: 36px; height: 36px; border-radius: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94a3b8; background: rgba(51,65,85,.35); border: 1px solid rgba(71,85,105,.3); }
    .pk-x:hover { background: rgba(239,68,68,.18); color: #fca5a5; }
    .pk-current { padding: 9px 20px; font-size: 12px; color: #94a3b8; background: rgba(30,58,138,0.15); border-bottom: 1px solid rgba(51,65,85,.25); }
    .pk-current b { color: #e2e8f0; }
    .pk-body { flex: 1; overflow-y: auto; padding: 18px 20px; }
    .pk-empty { text-align: center; color: #64748b; padding: 40px; font-size: 13px; }
    .pk-grid { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }
    .pk-wrap { position: relative; width: 180px; }
    .pk-flex { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); z-index: 6; padding: 2px 9px; border-radius: 100px; font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #fff; background: #d97706; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .pk-controls { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; padding: 11px 20px; border-bottom: 1px solid rgba(51,65,85,.25); background: rgba(10,15,28,.4); }
    .pk-fgroup { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .pk-flbl { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; margin-right: 3px; }
    .pk-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 100px; font-size: 11px; font-weight: 800; cursor: pointer; background: rgba(15,23,42,.7); border: 1px solid rgba(71,85,105,.35); color: #94a3b8; letter-spacing: .4px; }
    .pk-chip img { width: 13px; height: 13px; opacity: 0.75; }
    .pk-chip:hover { color: #e2e8f0; border-color: rgba(100,116,139,.6); }
    .pk-chip-on { color: #0b1020; background: #e2e8f0; border-color: #e2e8f0; }
    .pk-chip-on img { filter: brightness(0.2); opacity: 1; }
    .pk-chip-sort.pk-chip-on { background: #34d399; border-color: #34d399; color: #052e16; }
    .pk-sortval { position: absolute; top: 6px; right: 6px; z-index: 6; background: rgba(16,185,129,.95); color: #04120c; font-size: 9px; font-weight: 900; letter-spacing: .5px; padding: 2px 7px; border-radius: 999px; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
    .pk-compare { margin-top: 7px; padding: 7px 8px; border-radius: 11px; text-align: center; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.3); }
    .pk-total { font-size: 12px; font-weight: 900; margin-bottom: 4px; }
    .pk-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 6px; }
    .pk-sd { font-size: 9.5px; font-weight: 800; color: #475569; font-variant-numeric: tabular-nums; }
    .pk-pos { color: #34d399; }
    .pk-neg { color: #f87171; }
    .pk-neu { color: #64748b; }

    @media (max-width: 1200px) {
        .sq-grid { grid-template-columns: 240px minmax(0, 1fr); }
        .sq-stats { grid-column: 1 / -1; }
    }
    @media (max-width: 820px) {
        .sq-grid { grid-template-columns: 1fr; }
        .sqh-side { align-items: flex-start; width: 100%; }
        .sqh-chips { justify-content: flex-start; }
    }
    @media (max-width: 600px) {
        .sqh { padding: 18px; gap: 16px; }
        .sqh-power { width: 84px; height: 84px; border-radius: 24px; }
        .sp-n { font-size: 30px; }
        .form-row { gap: 10px; }
        /* Two cards side by side on a phone. */
        .slot-coach, .pos .slot { zoom: 0.84; }
        .pos-tag { font-size: 10px; }
        .pk-head { padding: 14px; }
        .pk-search input { width: 120px; }
        .pk-body { padding: 14px 10px; }
    }
</style>
