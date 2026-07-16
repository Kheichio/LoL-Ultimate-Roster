<script>
    import Card from '../card/Card.svelte';
    import { club, squad, academy, trackStats, grantBE, grantXP, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { getEffectiveRating } from '../../utils/cards.js';
    import { onMount, onDestroy } from 'svelte';

    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const roleIcons = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png' };
    const HOUR = 60 * 60 * 1000;

    $: unlocked = ($trackStats.worldsWon || 0) >= 1;

    // Live clock so the countdown and farming/complete states update every second.
    let now = Date.now();
    let ticker = null;
    onMount(() => { ticker = setInterval(() => { now = Date.now(); }, 1000); });
    onDestroy(() => { if (ticker) clearInterval(ticker); });

    $: players = ROLES.map(r => $academy[r]).filter(Boolean);
    $: assignedCount = players.length;
    $: ready = assignedCount === 5;
    $: avgRating = assignedCount > 0 ? Math.round(players.reduce((s, c) => s + getEffectiveRating(c), 0) / assignedCount) : 0;

    $: sentAt = $academy.sentAt || 0;
    $: farming = sentAt > 0 && now < sentAt + HOUR;
    $: complete = sentAt > 0 && now >= sentAt + HOUR;
    $: remainingMs = farming ? Math.max(0, sentAt + HOUR - now) : 0;
    $: locked = sentAt > 0; // roster is frozen while a run is out (until collected)

    // Rewards scale with the academy team's rating (idle 1h farming ≈ one tournament run).
    $: rewardBE = ready ? Math.round(avgRating * 25) : 0;
    $: rewardXP = ready ? Math.round(avgRating * 4) : 0;

    function fmtTime(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    // --- Roster picker ---
    let pickerOpen = false, pickerRole = null, pickerSearch = '';
    $: pickerPool = (() => {
        if (!pickerRole) return [];
        const squadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
        const academyIds = new Set(ROLES.filter(r => r !== pickerRole).map(r => $academy[r]?.uniqueId).filter(Boolean));
        let pool = $club.filter(c => c.role === pickerRole && !squadIds.has(c.uniqueId) && !academyIds.has(c.uniqueId));
        pool.sort((a, b) => b.rating - a.rating);
        if (pickerSearch) { const q = pickerSearch.toLowerCase(); pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q)); }
        return pool;
    })();

    function openPicker(role) {
        if (locked) { showToast('Academy is training — collect the run first to change the roster.', 'error'); return; }
        pickerRole = role; pickerSearch = ''; pickerOpen = true;
    }
    function closePicker() { pickerOpen = false; pickerRole = null; }
    function assignCard(card) { academy.update(a => ({ ...a, [pickerRole]: card })); closePicker(); saveGame(); }
    function removeCard(role) {
        if (locked) { showToast('Academy is training — collect the run first to change the roster.', 'error'); return; }
        academy.update(a => ({ ...a, [role]: null })); saveGame();
    }

    function sendToFarm() {
        if (!ready) { showToast('Assign all 5 academy players first.', 'error'); return; }
        if (sentAt > 0) return;
        academy.update(a => ({ ...a, sentAt: Date.now() }));
        saveGame();
        showToast('Academy sent to farm! Collect rewards in 1 hour.', 'success');
    }

    function collect() {
        if (!complete) return;
        const be = Math.round(avgRating * 25);
        const xp = Math.round(avgRating * 4);
        const { total } = grantBE(be);
        grantXP(xp);
        academy.update(a => ({ ...a, sentAt: 0 }));
        saveGame();
        showToast(`Academy earned ${total.toLocaleString()} BE and ${xp} XP!`, 'success');
    }
</script>

{#if !unlocked}
    <section class="ac">
        <div class="ac-lock">
            <div class="ac-lock-ico">🔒</div>
            <h2 class="ac-lock-h">Academy Locked</h2>
            <p class="ac-lock-p">Win the <strong>Worlds</strong> tournament to unlock your Academy — a second team that automatically farms Blue Essence and XP, one hour at a time. The stronger the roster you field, the more it earns.</p>
        </div>
    </section>
{:else}
    <section class="ac">
        <div class="ac-top">
            <div>
                <h2 class="ac-h">Academy Team</h2>
                <p class="ac-sub">Field a second five and send them to auto-farm every hour. Rewards scale with team rating.</p>
            </div>
        </div>

        <div class="ac-grid">
            <!-- Formation -->
            <div class="ac-formation">
                <div class="side-label">Academy Five {assignedCount}/5</div>
                <div class="ac-row">
                    {#each ROLES as role}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="slot" on:click={() => openPicker(role)}>
                            {#if $academy[role]}
                                <Card card={$academy[role]} mini={true} onclick={() => openPicker(role)} />
                                {#if !locked}<button class="rm" on:click|stopPropagation={() => removeCard(role)}>✕</button>{/if}
                            {:else}
                                <div class="empty"><img src={roleIcons[role]} alt="" class="empty-icon"><span class="empty-role">{role}</span></div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Farm panel -->
            <div class="ac-panel">
                <div class="side-label">Auto-Farm</div>
                <div class="ac-stat"><div class="ac-big">{avgRating}</div><div class="ac-sub2">Team Rating</div></div>
                <div class="ac-rewards">
                    <div class="ac-reward"><span class="ac-r-val">{rewardBE.toLocaleString()}</span><span class="ac-r-lbl">BE / hr</span></div>
                    <div class="ac-reward"><span class="ac-r-val">{rewardXP}</span><span class="ac-r-lbl">XP / hr</span></div>
                </div>

                {#if sentAt === 0}
                    <button class="ac-send" disabled={!ready} on:click={sendToFarm}>
                        {ready ? 'Send to Farm · 1h' : `Assign ${5 - assignedCount} more`}
                    </button>
                {:else if farming}
                    <div class="ac-progress">
                        <div class="ac-prog-fill" style="width:{Math.min(100, ((HOUR - remainingMs) / HOUR) * 100)}%"></div>
                    </div>
                    <button class="ac-timer" disabled><span class="ac-t-ico">⏱</span> Training… {fmtTime(remainingMs)}</button>
                {:else}
                    <button class="ac-collect" on:click={collect}>Collect {rewardBE.toLocaleString()} BE + {rewardXP} XP</button>
                {/if}

                {#if locked}
                    <p class="ac-note">Roster locked until you collect this run.</p>
                {/if}
            </div>
        </div>
    </section>
{/if}

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
            {#if pickerPool.length === 0}<div class="pk-empty">No eligible cards. Academy players can't already be in your main squad.</div>
            {:else}<div class="pk-grid">
                {#each pickerPool as card (card.uniqueId)}
                    <div class="pk-wrap">
                        <Card {card} mini={true} onclick={() => assignCard(card)} />
                    </div>
                {/each}
            </div>{/if}
        </div>
    </div>
</div>
{/if}

<style>
    .ac { padding-bottom: 40px; max-width: 1200px; margin: 0 auto; }
    .ac-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .ac-h { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .ac-sub { font-size: 12px; color: #64748b; margin-top: 2px; max-width: 520px; }
    .side-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #334155; margin-bottom: 10px; }

    .ac-grid { display: grid; grid-template-columns: 1fr 300px; gap: 24px; align-items: start; }
    @media (max-width: 1000px) { .ac-grid { grid-template-columns: 1fr; } }

    /* Formation */
    .ac-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .slot { position: relative; cursor: pointer; }
    .empty {
        width: 150px; height: 230px; border-radius: 14px;
        background: rgba(12,16,28,0.35); border: 2px dashed rgba(51,65,85,0.2);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
        transition: all .12s;
    }
    .empty:hover { border-color: rgba(20,184,166,0.3); background: rgba(12,16,28,0.5); }
    .empty-icon { width: 24px; height: 24px; opacity: .15; }
    .empty-role { font-size: 11px; color: #1e293b; font-weight: 800; }
    .rm {
        position: absolute; top: 4px; right: 4px; z-index: 10;
        width: 20px; height: 20px; border-radius: 6px;
        background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.15);
        color: #f87171; font-size: 9px; font-weight: 900; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity .1s;
    }
    .slot:hover .rm { opacity: 1; }

    /* Farm panel */
    .ac-panel {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(20,184,166,0.15);
        border-radius: 16px; padding: 18px;
    }
    .ac-stat { text-align: center; margin-bottom: 14px; }
    .ac-big { font-size: 40px; font-weight: 900; color: #5eead4; line-height: 1; }
    .ac-sub2 { font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    .ac-rewards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .ac-reward { background: rgba(15,23,42,0.4); border: 1px solid rgba(51,65,85,0.15); border-radius: 12px; padding: 12px; text-align: center; }
    .ac-r-val { display: block; font-size: 18px; font-weight: 900; color: #34d399; }
    .ac-r-lbl { display: block; font-size: 8px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

    .ac-send, .ac-collect, .ac-timer {
        width: 100%; padding: 12px; border-radius: 12px; border: none;
        font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;
        transition: all 0.15s;
    }
    .ac-send { background: linear-gradient(135deg, #0d9488, #14b8a6); color: #04211d; box-shadow: 0 4px 12px rgba(20,184,166,0.2); }
    .ac-send:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(20,184,166,0.35); transform: translateY(-1px); }
    .ac-send:disabled { background: rgba(30,41,59,0.6); color: #475569; cursor: not-allowed; }
    .ac-collect { background: linear-gradient(135deg, #d97706, #f59e0b); color: #1c1917; box-shadow: 0 4px 12px rgba(245,158,11,0.25); animation: acPulse 1.8s ease-in-out infinite; }
    .ac-collect:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(245,158,11,0.45); }
    @keyframes acPulse { 0%,100% { box-shadow: 0 4px 12px rgba(245,158,11,0.25); } 50% { box-shadow: 0 4px 22px rgba(245,158,11,0.55); } }
    .ac-timer { background: rgba(15,23,42,0.6); color: #5eead4; border: 1px solid rgba(20,184,166,0.25); cursor: default; }
    .ac-t-ico { font-size: 11px; }
    .ac-progress { height: 6px; background: rgba(15,23,42,0.8); border-radius: 99px; overflow: hidden; margin-bottom: 10px; }
    .ac-prog-fill { height: 100%; background: linear-gradient(90deg, #0d9488, #5eead4); border-radius: 99px; transition: width 1s linear; }
    .ac-note { font-size: 9px; color: #475569; text-align: center; margin-top: 10px; }

    /* Locked state */
    .ac-lock { max-width: 520px; margin: 60px auto; text-align: center; padding: 40px 24px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 20px; }
    .ac-lock-ico { font-size: 44px; margin-bottom: 12px; }
    .ac-lock-h { font-size: 22px; font-weight: 900; color: #e2e8f0; margin-bottom: 10px; }
    .ac-lock-p { font-size: 13px; color: #64748b; line-height: 1.6; }
    .ac-lock-p strong { color: #fbbf24; }

    /* Picker overlay */
    .pk-over { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .pk-bg { position: absolute; inset: 0; background: rgba(0,0,0,.75); backdrop-filter: blur(8px); }
    .pk-panel {
        position: relative; background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71,85,105,.2); border-radius: 20px;
        width: 100%; max-width: 1100px; max-height: 85vh;
        display: flex; flex-direction: column; box-shadow: 0 25px 80px rgba(0,0,0,.6);
    }
    .pk-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid rgba(51,65,85,.15); }
    .pk-left { display: flex; align-items: center; gap: 10px; }
    .pk-right { display: flex; align-items: center; gap: 10px; }
    .pk-title { font-size: 16px; font-weight: 900; color: #5eead4; letter-spacing: 1px; }
    .pk-ct { font-size: 11px; color: #475569; font-weight: 700; }
    .pk-x { width: 32px; height: 32px; border-radius: 10px; background: rgba(51,65,85,.3); border: 1px solid rgba(71,85,105,.2); color: #64748b; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .pk-x:hover { background: rgba(239,68,68,.15); color: #f87171; }
    .pk-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
    .pk-empty { text-align: center; color: #475569; padding: 40px; font-size: 13px; }
    .pk-grid { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
    .pk-wrap { position: relative; }
</style>
