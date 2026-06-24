<script>
    import Card from '../card/Card.svelte';
    import { club, squad, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { LEGACY_TIERS, getEffectiveStats } from '../../utils/cards.js';

    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const ALL_SLOTS = [...ROLES, 'COACH'];
    const roleIcons = { TOP:'/icons/Top_icon.png', JNG:'/icons/Jungle_icon.png', MID:'/icons/Middle_icon.png', ADC:'/icons/Bottom_icon.png', SUP:'/icons/Support_icon.png', COACH:'/icons/Specialist_icon.png' };

    let pickerOpen = false, pickerRole = null, pickerSearch = '';

    $: starters = ROLES.map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s,c) => s + c.rating, 0) / starters.length) : 0;
    $: avgStats = squadReady ? (() => { const sm={mec:0,tmf:0,frm:0,cmp:0,map:0,ldr:0}; starters.forEach(c=>{for(const k in sm) sm[k]+=c.stats[k]||0;}); for(const k in sm) sm[k]=Math.round(sm[k]/starters.length); return sm; })() : null;
    $: coachBonus = (() => { const c=$squad.COACH; if(!c) return 0; return c.rating>=98?5:c.rating>=94?4:c.rating>=90?3:c.rating>=85?2:1; })();
    $: regionChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.region)).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: yearChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.year)).size; return s<=1?5:s<=2?4:s<=3?3:s<=4?2:1; })();
    $: teamChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); return !nl.length||new Set(nl.map(c=>c.team)).size===1?2:0; })();
    $: legacyBonus = (()=>{ const c=starters.filter(c=>LEGACY_TIERS.includes(c.quality)).length; return c>=4?2:c>=2?1:0; })();
    $: totalPower = squadReady ? avgRating+regionChem+yearChem+teamChem+coachBonus+legacyBonus : 0;

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

    function openPicker(role) { pickerRole=role; pickerSearch=''; pickerOpen=true; }
    function closePicker() { pickerOpen=false; pickerRole=null; }
    function assignCard(card) { squad.update(s=>({...s,[pickerRole]:card})); closePicker(); saveGame(); }
    function removeCard(role) { squad.update(s=>({...s,[role]:null})); saveGame(); }
    function totalStats(c) {
        const s = getEffectiveStats(c);
        return (s.mec||0)+(s.tmf||0)+(s.frm||0)+(s.cmp||0)+(s.map||0)+(s.ldr||0);
    }
    function autofill() {
        const s={...$squad}; const used=new Set(); ALL_SLOTS.forEach(r=>{if(s[r])used.add(s[r].uniqueId);});
        ROLES.forEach(role=>{
            if(s[role]) return;
            const best=$club.filter(c=>c.role===role&&!used.has(c.uniqueId)).sort((a,b)=>totalStats(b)-totalStats(a))[0]
                ||$club.filter(c=>LEGACY_TIERS.includes(c.quality)&&!used.has(c.uniqueId)).sort((a,b)=>totalStats(b)-totalStats(a))[0];
            if(best){s[role]=best;used.add(best.uniqueId);}
        });
        if(!s.COACH){const c=$club.filter(c=>c.role==='COACH'&&!used.has(c.uniqueId)).sort((a,b)=>totalStats(b)-totalStats(a))[0]; if(c)s.COACH=c;}
        squad.set(s); saveGame(); showToast('Squad auto-filled by best total stats.','success');
    }
    function disband() { squad.set({COACH:null,TOP:null,JNG:null,MID:null,ADC:null,SUP:null}); saveGame(); }
</script>

<section class="sq">
    <div class="sq-top">
        <div><h2 class="sq-h">Squad Builder</h2><p class="sq-sub">{squadReady?`Total Power: ${totalPower}`:'Fill all 5 positions'}</p></div>
        <div class="sq-btns">
            <button class="btn-primary" on:click={autofill}>Auto Fill</button>
            <button class="btn-secondary" on:click={disband}>Disband</button>
        </div>
    </div>

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
            <!-- Bench placeholders -->
            {#each [1,2,3] as i}
                <div class="slot-bench"><span class="bench-lbl">Bench {i}</span><span class="bench-lock">🔒</span></div>
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
                        <div class="slot" on:click={() => openPicker(role)}>
                            {#if $squad[role]}<Card card={$squad[role]} mini={true} onclick={() => openPicker(role)} /><button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>
                            {:else}<div class="empty"><img src={roleIcons[role]} alt="" class="empty-icon"><span class="empty-role">{role}</span></div>{/if}
                        </div>
                    {/each}
                </div>
                <!-- JNG + MID -->
                <div class="form-row">
                    {#each ['JNG','MID'] as role}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="slot" on:click={() => openPicker(role)}>
                            {#if $squad[role]}<Card card={$squad[role]} mini={true} onclick={() => openPicker(role)} /><button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>
                            {:else}<div class="empty"><img src={roleIcons[role]} alt="" class="empty-icon"><span class="empty-role">{role}</span></div>{/if}
                        </div>
                    {/each}
                </div>
                <!-- ADC + SUP -->
                <div class="form-row">
                    {#each ['ADC','SUP'] as role}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="slot" on:click={() => openPicker(role)}>
                            {#if $squad[role]}<Card card={$squad[role]} mini={true} onclick={() => openPicker(role)} /><button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>
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
                    {#each [['Region',regionChem+'/5'],['Year',yearChem+'/5'],['Team','+'+teamChem],['Coach','+'+coachBonus],['Legacy','+'+legacyBonus]] as [l,v]}
                        <div class="chem-row"><span>{l}</span><span class="chem-v">{v}</span></div>
                    {/each}
                </div>
                <div class="formula-bar">{avgRating}+{regionChem}+{yearChem}+{teamChem}+{coachBonus}+{legacyBonus} = <b>{totalPower}</b></div>
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

<style>
    .sq { padding-bottom: 40px; max-width: 1400px; margin: 0 auto; }
    .sq-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
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
        height:50px; border-radius:10px; display:flex; align-items:center; justify-content:space-between;
        padding:0 14px; background:rgba(12,16,28,0.3); border:1px dashed rgba(51,65,85,0.15);
    }
    .bench-lbl { font-size:10px; color:#1e293b; font-weight:700; }
    .bench-lock { font-size:10px; opacity:.3; }

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
