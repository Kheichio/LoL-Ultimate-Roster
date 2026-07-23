<script>
    import Card from '../card/Card.svelte';
    import { club, squad, bench, skills, seasonData, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { LEGACY_TIERS, getEffectiveStats, getEffectiveRating, getEra } from '../../utils/cards.js';

    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const ALL_SLOTS = [...ROLES, 'COACH'];
    $: benchLevel = $skills.bench || 0;
    $: safeBench = Array.isArray($bench) ? $bench : [null, null, null];
    $: splitActive = (($seasonData.opponents || []).length > 0 && ($seasonData.matchResults || []).filter(r => r === true || r === false).length < 10);
    const roleIcons = { TOP:'/icons/Top_icon.png', JNG:'/icons/Jungle_icon.png', MID:'/icons/Middle_icon.png', ADC:'/icons/Bottom_icon.png', SUP:'/icons/Support_icon.png', COACH:'/icons/Specialist_icon.png' };

    let pickerOpen = false, pickerRole = null, pickerSearch = '';

    $: starters = ROLES.map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s,c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: avgStats = squadReady ? (() => { const sm={mec:0,tmf:0,frm:0,cmp:0,map:0,ldr:0}; starters.forEach(c=>{for(const k in sm) sm[k]+=c.stats[k]||0;}); for(const k in sm) sm[k]=Math.round(sm[k]/starters.length); return sm; })() : null;
    $: coachBonus = (() => { const c=$squad.COACH; if(!c) return 0; return c.rating>=98?5:c.rating>=94?4:c.rating>=90?3:c.rating>=85?2:1; })();
    $: regionChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.region)).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: eraChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>getEra(c.year))).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: teamChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); return !nl.length||new Set(nl.map(c=>c.team)).size===1?2:0; })();
    $: legacyBonus = (()=>{ const c=starters.filter(c=>LEGACY_TIERS.includes(c.quality)).length; return c>=4?2:c>=2?1:0; })();
    $: conditioningBonus = $skills.conditioning || 0;
    $: totalPower = squadReady ? avgRating+regionChem+eraChem+teamChem+coachBonus+legacyBonus+conditioningBonus : 0;

    $: pickerPool = (() => {
        if (!pickerRole) return [];
        const used = new Set(ALL_SLOTS.filter(r => r !== pickerRole).map(r => $squad[r]?.uniqueId).filter(Boolean));
        let pool = $club.filter(c => !used.has(c.uniqueId));
        if (pickerRole === 'COACH') pool = pool.filter(c => c.role === 'COACH');
        else pool = pool.filter(c => c.role !== 'COACH' && (c.role === pickerRole || LEGACY_TIERS.includes(c.quality)));
        pool.sort((a,b) => { const ag=a.role===pickerRole?0:1, bg=b.role===pickerRole?0:1; return ag!==bg?ag-bg:b.rating-a.rating; });
        if (pickerSearch) { const q=pickerSearch.toLowerCase(); pool=pool.filter(c=>c.name.toLowerCase().includes(q)||c.team.toLowerCase().includes(q)); }
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
        pickerRole=role; pickerSearch=''; pickerOpen=true;
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
        squad.set({COACH:null,TOP:null,JNG:null,MID:null,ADC:null,SUP:null}); saveGame();
    }

    let benchPickerOpen = false;
    let benchPickerIdx = null;
    let benchSearch = '';
    let benchRoleFilter = 'ALL';
    let benchSort = 'rating';
    const BENCH_ROLES = ['ALL', 'TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const BENCH_SORTS = [['rating','RTG'], ['mec','MEC'], ['tmf','TMF'], ['frm','FRM'], ['cmp','CMP'], ['map','MAP'], ['ldr','LDR']];

    $: benchUsedIds = new Set([
        ...Object.values($squad).filter(Boolean).map(c => c.uniqueId),
        ...(Array.isArray($bench) ? $bench : []).filter(Boolean).map(c => c.uniqueId)
    ]);

    $: benchPickerPool = (() => {
        if (benchPickerIdx === null) return [];
        let pool = $club.filter(c => c.role !== 'COACH' && !benchUsedIds.has(c.uniqueId));
        if (benchRoleFilter !== 'ALL') pool = pool.filter(c => c.role === benchRoleFilter);
        if (benchSearch) { const q = benchSearch.toLowerCase(); pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q)); }
        const val = c => benchSort === 'rating' ? getEffectiveRating(c) : (getEffectiveStats(c)[benchSort] || 0);
        return pool.slice().sort((a, b) => val(b) - val(a));
    })();

    function openBenchPicker(idx) {
        if (splitActive) { showToast('Bench is locked during an active split. Use the swap buttons below.', 'error'); return; }
        benchPickerIdx = idx; benchSearch = ''; benchRoleFilter = 'ALL'; benchSort = 'rating'; benchPickerOpen = true;
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
</script>

<section class="sq">
    <div class="sq-top">
        <div><h2 class="sq-h">Squad Builder</h2><p class="sq-sub">{squadReady?`Total Power: ${totalPower}`:'Fill all 5 positions'}</p></div>
        <div class="sq-btns">
            {#if !splitActive}
                <button class="btn-primary" on:click={autofill}>Auto Fill</button>
                <button class="btn-secondary" on:click={disband}>Disband</button>
            {/if}
        </div>
    </div>
    {#if splitActive}
        <div class="squad-lock-banner">
            <span class="slb-icon">🔒</span>
            <span class="slb-text">Squad locked — Season Split in progress. {safeBench.filter(Boolean).length > 0 ? 'Click a bench player to swap with a starter.' : 'Add bench players before starting a split to enable swaps.'}</span>
        </div>
    {/if}
    {#if swapMode}
        <div class="swap-banner">
            <span class="swb-text">Select a starter to swap with <strong>{safeBench[swapBenchIdx]?.name || 'bench player'}</strong></span>
            <button class="swb-cancel" on:click={cancelSwap}>Cancel</button>
        </div>
    {/if}

    <div class="sq-grid">
        <!-- Left: Coach + Bench -->
        <div class="sq-side">
            <div class="side-label">Staff & Bench</div>
            <!-- Coach -->
            <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="slot slot-sm" on:click={() => openPicker('COACH')}>
                {#if $squad.COACH}<Card card={$squad.COACH} mini={true} onclick={() => openPicker('COACH')} /><button class="rm" on:click|stopPropagation={() => removeCard('COACH')}>✕</button>
                {:else}<div class="empty-sm"><img src={roleIcons.COACH} alt="" class="empty-icon"><span>Coach</span></div>{/if}
            </div>
            <!-- Bench slots -->
            {#each [0,1,2] as idx}
                {#if idx < benchLevel}
                    <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="slot-bench slot-bench-active" class:slot-bench-swap={swapMode && swapBenchIdx === idx} on:click={() => splitActive && safeBench[idx] ? startSwap(idx) : openBenchPicker(idx)}>
                        {#if safeBench[idx]}
                            <Card card={safeBench[idx]} mini={true} onclick={() => splitActive ? startSwap(idx) : openBenchPicker(idx)} />
                            {#if !splitActive}<button class="rm" on:click|stopPropagation={() => removeBench(idx)}>✕</button>{/if}
                            {#if splitActive}<div class="bench-swap-tag">Tap to swap</div>{/if}
                        {:else}
                            <span class="bench-lbl">Bench {idx + 1}</span>
                            {#if splitActive}<span class="bench-lock">—</span>{:else}<span class="bench-add">+</span>{/if}
                        {/if}
                    </div>
                {:else}
                    <div class="slot-bench"><span class="bench-lbl">Bench {idx + 1}</span><span class="bench-lock">🔒</span></div>
                {/if}
            {/each}
        </div>

        <!-- Center: Formation -->
        <div class="sq-formation">
            <div class="side-label">Starting 5</div>
            <div class="form">
                <!-- TOP solo -->
                <div class="form-row">
                    {#each ['TOP'] as role}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="slot" class:slot-swap-target={swapMode} on:click={() => slotClick(role)}>
                            {#if $squad[role]}<Card card={$squad[role]} mini={true} onclick={() => slotClick(role)} />{#if !splitActive}<button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>{/if}
                            {:else}<div class="empty"><img src={roleIcons[role]} alt="" class="empty-icon"><span class="empty-role">{role}</span></div>{/if}
                        </div>
                    {/each}
                </div>
                <!-- JNG + MID -->
                <div class="form-row">
                    {#each ['JNG','MID'] as role}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="slot" class:slot-swap-target={swapMode} on:click={() => slotClick(role)}>
                            {#if $squad[role]}<Card card={$squad[role]} mini={true} onclick={() => slotClick(role)} />{#if !splitActive}<button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>{/if}
                            {:else}<div class="empty"><img src={roleIcons[role]} alt="" class="empty-icon"><span class="empty-role">{role}</span></div>{/if}
                        </div>
                    {/each}
                </div>
                <!-- ADC + SUP -->
                <div class="form-row">
                    {#each ['ADC','SUP'] as role}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="slot" class:slot-swap-target={swapMode} on:click={() => slotClick(role)}>
                            {#if $squad[role]}<Card card={$squad[role]} mini={true} onclick={() => slotClick(role)} />{#if !splitActive}<button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>{/if}
                            {:else}<div class="empty"><img src={roleIcons[role]} alt="" class="empty-icon"><span class="empty-role">{role}</span></div>{/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <!-- Right: Stats -->
        <div class="sq-stats">
            <div class="side-label">Analytics</div>
            {#if !squadReady}
                <div class="stats-empty">Fill 5 positions to see stats</div>
            {:else}
                <div class="stat-pair">
                    <div class="stat-box"><div class="stat-big">{avgRating}</div><div class="stat-sub">Rating</div></div>
                    <div class="stat-box stat-green"><div class="stat-big">{totalPower}</div><div class="stat-sub">Power</div></div>
                </div>
                <div class="chem-list">
                    {#each [['Region',regionChem+'/5'],['Era',eraChem+'/5'],['Team','+'+teamChem],['Coach','+'+coachBonus],['Legacy','+'+legacyBonus]] as [l,v]}
                        <div class="chem-row"><span>{l}</span><span class="chem-v">{v}</span></div>
                    {/each}
                </div>
                <div class="formula-bar">{avgRating}+{regionChem}+{eraChem}+{teamChem}+{coachBonus}+{legacyBonus} = <b>{totalPower}</b></div>
                {#if avgStats}
                    <div class="avg-label">Avg Stats</div>
                    <div class="avg-grid">
                        {#each Object.entries(avgStats) as [s,v]}<div class="avg-cell"><span class="avg-s">{s.toUpperCase()}</span><span class="avg-v">{v}</span></div>{/each}
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</section>

<!-- Picker -->
{#if pickerOpen}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pk-over">
    <div class="pk-bg" on:click={closePicker}></div>
    <div class="pk-panel">
        <div class="pk-head">
            <div class="pk-left"><img src={roleIcons[pickerRole]} alt="" style="width:18px;height:18px;opacity:.6"><span class="pk-title">{pickerRole}</span><span class="pk-ct">{pickerPool.length}</span></div>
            <div class="pk-right"><input type="text" bind:value={pickerSearch} placeholder="Search..." class="input" style="width:150px;padding:6px 10px;font-size:11px;"><button class="pk-x" on:click={closePicker}>✕</button></div>
        </div>
        <div class="pk-body">
            {#if pickerPool.length===0}<div class="pk-empty">No eligible cards.</div>
            {:else}<div class="pk-grid">
                {#each pickerPool as card (card.uniqueId)}
                    {@const diff = statDiff(card, currentSlotCard)}
                    {@const perStat = perStatDiff(card, currentSlotCard)}
                    <div class="pk-wrap">
                        <Card {card} mini={true} onclick={() => assignCard(card)} />
                        {#if card.role!==pickerRole&&pickerRole!=='COACH'}<div class="pk-flex">FLEX</div>{/if}
                        {#if currentSlotCard}
                            <div class="pk-compare">
                                <div class="pk-total" class:pk-pos={diff > 0} class:pk-neg={diff < 0} class:pk-neu={diff === 0}>
                                    {diff > 0 ? '+' : ''}{diff} total
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

<!-- Bench Picker -->
{#if benchPickerOpen}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pk-over">
    <div class="pk-bg" on:click={closeBenchPicker}></div>
    <div class="pk-panel">
        <div class="pk-head">
            <div class="pk-left"><span class="pk-title">Bench {(benchPickerIdx || 0) + 1}</span><span class="pk-ct">{benchPickerPool.length}</span></div>
            <div class="pk-right"><input type="text" bind:value={benchSearch} placeholder="Search name/team..." class="input pk-search"><button class="pk-x" on:click={closeBenchPicker}>✕</button></div>
        </div>
        <div class="pk-controls">
            <div class="pk-fgroup">
                <span class="pk-flbl">Role</span>
                {#each BENCH_ROLES as r}
                    <button class="pk-chip" class:pk-chip-on={benchRoleFilter===r} on:click={() => benchRoleFilter=r}>{r}</button>
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
    .sq { padding-bottom: 40px; max-width: 1400px; margin: 0 auto; }
    .sq-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
    .squad-lock-banner {
        display: flex; align-items: center; gap: 8px; padding: 10px 16px; margin-bottom: 16px;
        border-radius: 10px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2);
    }
    .slb-icon { font-size: 16px; }
    .slb-text { font-size: 11px; color: #f59e0b; font-weight: 700; }
    .swap-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px 16px; margin-bottom: 16px; border-radius: 10px;
        background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.3);
        animation: swapPulse 1.5s ease-in-out infinite;
    }
    @keyframes swapPulse { 0%,100% { border-color: rgba(20,184,166,0.3); } 50% { border-color: rgba(20,184,166,0.6); } }
    .swb-text { font-size: 12px; color: #5eead4; font-weight: 700; }
    .swb-cancel { padding: 4px 12px; border-radius: 6px; background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.2); color: #94a3b8; font-size: 10px; font-weight: 700; cursor: pointer; }
    .slot-swap-target { border-color: rgba(20,184,166,0.4) !important; cursor: pointer !important; animation: swapPulse 1.5s ease-in-out infinite; }
    .slot-bench-swap { border-color: rgba(20,184,166,0.6) !important; background: rgba(20,184,166,0.12) !important; }
    .bench-swap-tag { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); font-size: 8px; font-weight: 900; color: #14b8a6; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 4px; }
    .sq-h { font-size:22px; font-weight:900; color:#e2e8f0; }
    .sq-sub { font-size:12px; color:#64748b; margin-top:2px; }
    .sq-btns { display:flex; gap:8px; }

    .sq-grid { display:grid; grid-template-columns:200px 1fr 300px; gap:24px; }
    @media(max-width:1100px) { .sq-grid { grid-template-columns:1fr; } }
    .side-label { font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; color:#334155; margin-bottom:10px; }

    /* Side */
    .sq-side { display:flex; flex-direction:column; gap:8px; }
    .slot { position:relative; cursor:pointer; }
    .slot-sm { }
    .slot-bench {
        min-height:50px; border-radius:10px; display:flex; align-items:center; justify-content:space-between;
        padding:0 14px; background:rgba(12,16,28,0.3); border:1px dashed rgba(51,65,85,0.15);
    }
    .slot-bench-active {
        border-color: rgba(20,184,166,0.3); background: rgba(20,184,166,0.04);
        cursor: pointer; transition: all 0.12s; position: relative; padding: 6px;
    }
    .slot-bench-active:hover { border-color: rgba(20,184,166,0.5); background: rgba(20,184,166,0.08); }
    .bench-lbl { font-size:10px; color:#1e293b; font-weight:700; }
    .bench-lock { font-size:10px; opacity:.3; }
    .bench-add { font-size:16px; color:#14b8a6; font-weight:900; }

    /* Formation */
    .sq-formation { display:flex; flex-direction:column; align-items:center; }
    .form { display:flex; flex-direction:column; align-items:center; gap:10px; }
    .form-row { display:flex; gap:14px; justify-content:center; }

    .empty {
        width:170px; height:260px; border-radius:14px;
        background:rgba(12,16,28,0.35); border:2px dashed rgba(51,65,85,0.2);
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
        transition:all .12s;
    }
    .empty:hover { border-color:rgba(59,130,246,0.25); background:rgba(12,16,28,0.5); }
    .empty-sm {
        width:170px; height:120px; border-radius:12px;
        background:rgba(12,16,28,0.3); border:2px dashed rgba(51,65,85,0.15);
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
        transition:all .12s;
    }
    .empty-sm:hover { border-color:rgba(59,130,246,0.2); }
    .empty-sm span { font-size:10px; color:#1e293b; font-weight:700; }
    .empty-icon { width:24px; height:24px; opacity:.15; }
    .empty-role { font-size:11px; color:#1e293b; font-weight:800; }
    .rm {
        position:absolute; top:4px; right:4px; z-index:10;
        width:20px; height:20px; border-radius:6px;
        background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.15);
        color:#f87171; font-size:9px; font-weight:900; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        opacity:0; transition:opacity .1s;
    }
    .slot:hover .rm { opacity:1; }

    /* Stats */
    .sq-stats { }
    .stats-empty { color:#1e293b; font-size:11px; text-align:center; padding:40px 0; }
    .stat-pair { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
    .stat-box { background:rgba(15,23,42,.35); border:1px solid rgba(51,65,85,.12); border-radius:12px; padding:14px; text-align:center; }
    .stat-green { border-color:rgba(16,185,129,.12); }
    .stat-big { font-size:28px; font-weight:900; color:#e2e8f0; }
    .stat-green .stat-big { color:#34d399; }
    .stat-sub { font-size:8px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; }
    .chem-list { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
    .chem-row { display:flex; justify-content:space-between; font-size:11px; padding:6px 10px; border-radius:6px; background:rgba(15,23,42,.2); color:#475569; }
    .chem-v { font-weight:900; color:#94a3b8; }
    .formula-bar { text-align:center; font-size:9px; color:#334155; padding:6px; border-radius:6px; background:rgba(15,23,42,.15); margin-bottom:12px; }
    .formula-bar b { color:#34d399; }
    .avg-label { font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#334155; margin-bottom:6px; }
    .avg-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
    .avg-cell { background:rgba(15,23,42,.25); padding:8px 4px; border-radius:6px; text-align:center; }
    .avg-s { display:block; font-size:7px; font-weight:800; color:#334155; text-transform:uppercase; }
    .avg-v { display:block; font-size:16px; font-weight:900; color:#94a3b8; margin-top:1px; }

    /* Picker — full overlay */
    .pk-over { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; padding:16px; }
    .pk-bg { position:absolute; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(8px); }
    .pk-panel {
        position:relative; background:linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border:1px solid rgba(71,85,105,.2); border-radius:20px;
        width:100%; max-width:1100px; max-height:85vh;
        display:flex; flex-direction:column;
        box-shadow:0 25px 80px rgba(0,0,0,.6);
    }
    .pk-head {
        display:flex; justify-content:space-between; align-items:center;
        padding:18px 24px; border-bottom:1px solid rgba(51,65,85,.15);
    }
    .pk-left { display:flex; align-items:center; gap:10px; }
    .pk-right { display:flex; align-items:center; gap:10px; }
    .pk-title { font-size:16px; font-weight:900; color:#93c5fd; letter-spacing:1px; }
    .pk-ct { font-size:11px; color:#475569; font-weight:700; }
    .pk-x {
        width:32px; height:32px; border-radius:10px;
        background:rgba(51,65,85,.3); border:1px solid rgba(71,85,105,.2);
        color:#64748b; font-size:14px; font-weight:700; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
    }
    .pk-x:hover { background:rgba(239,68,68,.15); color:#f87171; }
    .pk-body { flex:1; overflow-y:auto; padding:20px 24px; }
    .pk-empty { text-align:center; color:#475569; padding:40px; font-size:13px; }
    .pk-grid { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; }
    .pk-wrap { position:relative; }
    .pk-flex {
        position:absolute; bottom:0; left:0; right:0;
        background:rgba(217,119,6,.85); color:#fff;
        font-size:8px; font-weight:900; text-align:center;
        padding:3px; border-radius:0 0 14px 14px; letter-spacing:1px;
    }
    /* Bench picker filters + sort */
    .pk-controls {
        display:flex; flex-wrap:wrap; gap:12px 22px; align-items:center;
        padding:12px 24px; border-bottom:1px solid rgba(51,65,85,.15);
        background:rgba(10,15,28,.4);
    }
    .pk-fgroup { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .pk-flbl { font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#475569; margin-right:2px; }
    .pk-chip {
        padding:5px 11px; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer;
        background:rgba(51,65,85,.25); border:1px solid rgba(71,85,105,.25); color:#94a3b8;
        transition:background .12s, border-color .12s, color .12s; letter-spacing:.5px;
    }
    .pk-chip:hover { border-color:rgba(96,165,250,.4); color:#cbd5e1; }
    .pk-chip-on { background:rgba(59,130,246,.22); border-color:rgba(96,165,250,.6); color:#93c5fd; }
    .pk-chip-sort.pk-chip-on { background:rgba(16,185,129,.2); border-color:rgba(52,211,153,.6); color:#6ee7b7; }
    .pk-search { width:170px; padding:6px 10px; font-size:11px; }
    .pk-sortval {
        position:absolute; top:6px; right:6px; z-index:3;
        background:rgba(16,185,129,.92); color:#04120c;
        font-size:9px; font-weight:900; letter-spacing:.5px;
        padding:2px 7px; border-radius:999px; box-shadow:0 2px 6px rgba(0,0,0,.4);
    }

    /* Stat comparison */
    .pk-compare {
        width: 100%; margin-top: 6px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 10px; padding: 8px; text-align: center;
    }
    .pk-total {
        font-size: 13px; font-weight: 900; margin-bottom: 4px;
    }
    .pk-stats {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 6px;
    }
    .pk-sd {
        font-size: 9px; font-weight: 800; color: #475569;
    }
    .pk-pos { color: #34d399; }
    .pk-neg { color: #f87171; }
    .pk-neu { color: #64748b; }
</style>
