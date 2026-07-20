<script>
    import Card from '../card/Card.svelte';
    import { onDestroy } from 'svelte';
    import { club, squad, academy, collectionRegistry, trackStats, rbcState, grantXP, grantBPXP, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { getDB, getEffectiveRating } from '../../utils/cards.js';
    import { rollCardsFromDrops } from '../../utils/packs.js';
    import { CHALLENGES, REWARD_PACKS, todayKey, msUntilReset, claimedToday, requirementChips, validateSubmission } from '../../utils/rbc.js';
    import { playSound } from '../../utils/sound.js';

    let nowTs = Date.now();
    const tick = setInterval(() => { nowTs = Date.now(); }, 1000);
    onDestroy(() => clearInterval(tick));

    $: today = todayKey(nowTs);
    $: claimed = claimedToday($rbcState, today);
    $: resetLabel = fmtCountdown(msUntilReset(nowTs));

    function fmtCountdown(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
    }

    // Submission state
    let active = null;      // the challenge being solved
    let slots = [];         // array of length req.count — card objects or null
    let pickerIdx = -1;     // which slot the picker is filling

    // Reward reveal
    let showReward = false;
    let rewardCards = [];
    let rewardMeta = null;

    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
    $: academyIds = new Set(['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => $academy[r]).filter(Boolean).map(c => c.uniqueId));
    $: slotIds = new Set(slots.filter(Boolean).map(c => c.uniqueId));

    // Cards a player may submit: not in the squad/academy, not locked, not holo/sig (protect the good stuff).
    $: eligible = $club
        .filter(c => !activeSquadIds.has(c.uniqueId) && !academyIds.has(c.uniqueId) && !c.locked && !c.signature && !c.holographic)
        .sort((a, b) => getEffectiveRating(b) - getEffectiveRating(a));
    $: pickerCards = eligible.filter(c => !slotIds.has(c.uniqueId));

    $: validation = active ? validateSubmission(active, slots) : null;

    function startChallenge(ch) {
        if (claimed[ch.id]) return;
        active = ch;
        slots = Array(ch.req.count).fill(null);
        pickerIdx = -1;
    }
    function closeChallenge() { active = null; slots = []; pickerIdx = -1; }
    function openPicker(i) { pickerIdx = i; }
    function closePicker() { pickerIdx = -1; }
    function pickCard(card) {
        if (pickerIdx < 0) return;
        slots[pickerIdx] = card;
        slots = slots;
        pickerIdx = -1;
    }
    function clearSlot(i) { slots[i] = null; slots = slots; }

    function confirmComplete() {
        if (!active || !validation || !validation.valid || claimed[active.id]) return;
        const pack = REWARD_PACKS[active.reward.pack];
        openConfirmModal(
            `Submit these ${active.reward.count} players? They will be CONSUMED and you'll receive a free ${pack.label} pack (5 cards).`,
            doComplete
        );
    }

    function doComplete() {
        if (!active || !validation || !validation.valid || claimed[active.id]) return;
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }

        const ch = active;
        const pack = REWARD_PACKS[ch.reward.pack];
        const consumeIds = new Set(slots.filter(Boolean).map(c => c.uniqueId));
        const pulled = rollCardsFromDrops(db, pack.drops, ch.reward.count, 'rbc_');

        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), ...pulled]);
        collectionRegistry.update(reg => {
            const u = { ...reg };
            pulled.forEach(c => { u[c.id] = true; });
            return u;
        });
        rbcState.update(s => {
            const base = s && s.day === today ? (s.claimed || {}) : {};
            return { day: today, claimed: { ...base, [ch.id]: true } };
        });
        trackStats.update(s => ({ ...s, rbcCompleted: (s.rbcCompleted || 0) + 1 }));
        grantXP(60);
        grantBPXP(40);
        playSound('rare');

        rewardCards = pulled;
        rewardMeta = pack;
        showReward = true;
        active = null;
        slots = [];
        pickerIdx = -1;
        saveGame();
    }

    function closeReward() { showReward = false; rewardCards = []; rewardMeta = null; }
</script>

<section class="rbc">
    <!-- Header -->
    <div class="rbc-head">
        <div>
            <h2 class="rbc-title">Roster Building Challenges</h2>
            <p class="rbc-sub">Trade a themed five for a guaranteed reward pack — resets daily.</p>
        </div>
        <div class="rbc-reset">
            <span class="rr-label">Resets in</span>
            <span class="rr-time">{resetLabel}</span>
        </div>
    </div>

    <!-- How it works -->
    <div class="rbc-info">
        <div class="ri-title">How it works</div>
        <ol class="ri-steps">
            <li><b>Pick a challenge</b> below. Each asks for a themed set of 5 players (same region, same team, a rating floor, etc.).</li>
            <li><b>Submit players from your Club</b> that meet every requirement. Squad, Academy, locked, holographic and signature cards are protected and can't be used.</li>
            <li><b>Submitted players are consumed</b> — in exchange you get a <b>free 5-card reward pack</b>, no Blue Essence needed.</li>
            <li><b>The tougher the challenge, the better the pack.</b> Rewards scale from Premium up to a full EWC pack.</li>
            <li>Each challenge can be completed <b>once per day</b>. Everything resets at midnight.</li>
        </ol>
    </div>

    <!-- Challenge list -->
    <div class="rbc-list">
        {#each CHALLENGES as ch}
            {@const pack = REWARD_PACKS[ch.reward.pack]}
            {@const done = claimed[ch.id]}
            <div class="ch-card" class:ch-done={done} style="--accent: {ch.color};">
                <div class="ch-top">
                    <span class="ch-icon">{ch.icon}</span>
                    <div class="ch-name-wrap">
                        <div class="ch-name">{ch.name}</div>
                        <div class="ch-pips">
                            {#each Array(5) as _, i}
                                <span class="pip" class:pip-on={i < ch.difficulty}></span>
                            {/each}
                            <span class="ch-blurb">{ch.blurb}</span>
                        </div>
                    </div>
                </div>

                <div class="ch-reqs">
                    {#each requirementChips(ch) as chip}
                        <span class="req-chip">{chip}</span>
                    {/each}
                </div>

                <div class="ch-foot">
                    <div class="ch-reward">
                        <span class="cr-label">Reward</span>
                        <span class="cr-pack" style="color: {pack.color};">{ch.reward.count}× {pack.label} Pack</span>
                    </div>
                    {#if done}
                        <button class="ch-btn ch-btn-done" disabled>Completed ✓</button>
                    {:else}
                        <button class="ch-btn" style="--accent: {ch.color};" on:click={() => startChallenge(ch)}>Start →</button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</section>

<!-- Submission Modal -->
{#if active}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="ov" on:click={closeChallenge}>
    <div class="sub-modal" on:click|stopPropagation style="--accent: {active.color};">
        <button class="ov-close" on:click={closeChallenge}>✕</button>
        <div class="sub-head">
            <span class="sub-icon">{active.icon}</span>
            <div>
                <div class="sub-name">{active.name}</div>
                <div class="sub-reward" style="color: {REWARD_PACKS[active.reward.pack].color};">Reward: {active.reward.count}× {REWARD_PACKS[active.reward.pack].label} Pack</div>
            </div>
        </div>

        <!-- Slots -->
        <div class="slots">
            {#each slots as slot, i}
                <div class="slot">
                    {#if slot}
                        <Card card={slot} mini={true} onclick={() => clearSlot(i)} />
                        <button class="slot-remove" on:click={() => clearSlot(i)}>✕ Remove</button>
                    {:else}
                        <button class="slot-empty" on:click={() => openPicker(i)}>
                            <span class="se-plus">+</span>
                            <span class="se-label">Add player</span>
                        </button>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Requirement checks -->
        {#if validation}
        <div class="checks">
            {#each validation.checks as c}
                <div class="check" class:check-ok={c.ok}>
                    <span class="check-mark">{c.ok ? '✓' : '○'}</span>
                    <span class="check-label">{c.label}</span>
                </div>
            {/each}
        </div>
        {/if}

        <button class="complete-btn" disabled={!validation || !validation.valid} on:click={confirmComplete}>
            {validation && validation.valid ? 'Complete Challenge' : 'Requirements not met'}
        </button>
        <div class="sub-warn">Submitted players are permanently consumed.</div>
    </div>
</div>
{/if}

<!-- Card Picker -->
{#if pickerIdx >= 0}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="ov ov-top" on:click={closePicker}>
    <div class="pick-modal" on:click|stopPropagation>
        <button class="ov-close" on:click={closePicker}>✕</button>
        <div class="pick-head">Choose a player <span class="pick-count">{pickerCards.length} eligible</span></div>
        {#if pickerCards.length === 0}
            <div class="pick-empty">No eligible players. Unlock cards or clear your squad to free some up.</div>
        {:else}
            <div class="pick-grid">
                {#each pickerCards as card (card.uniqueId)}
                    <Card {card} mini={true} onclick={() => pickCard(card)} />
                {/each}
            </div>
        {/if}
    </div>
</div>
{/if}

<!-- Reward Reveal -->
{#if showReward}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="ov" on:click={closeReward}>
    <div class="rew-modal" on:click|stopPropagation>
        <div class="rew-title" style="color: {rewardMeta?.color};">{rewardMeta?.label} Pack — Opened!</div>
        <div class="rew-sub">{rewardCards.length} cards added to your Club</div>
        <div class="rew-grid">
            {#each rewardCards as card (card.uniqueId)}
                <Card {card} mini={true} />
            {/each}
        </div>
        <button class="rew-btn" on:click={closeReward}>Continue</button>
    </div>
</div>
{/if}

<style>
    .rbc { max-width: 1100px; margin: 0 auto; padding-bottom: 40px; }

    /* Head */
    .rbc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    .rbc-title { font-size: 24px; font-weight: 900; color: #fbbf24; letter-spacing: 0.5px; }
    .rbc-sub { font-size: 12px; color: #64748b; margin-top: 3px; }
    .rbc-reset { display: flex; flex-direction: column; align-items: center; padding: 8px 18px; border-radius: 12px; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); }
    .rr-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #a16207; }
    .rr-time { font-size: 16px; font-weight: 900; color: #fbbf24; font-family: monospace; }

    /* Info panel */
    .rbc-info { background: linear-gradient(135deg, rgba(251,191,36,0.06), rgba(12,16,28,0.5) 60%); border: 1px solid rgba(251,191,36,0.14); border-radius: 16px; padding: 18px 22px; margin-bottom: 22px; }
    .ri-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #fbbf24; margin-bottom: 10px; }
    .ri-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
    .ri-steps li { font-size: 12px; color: #94a3b8; line-height: 1.5; }
    .ri-steps b { color: #e2e8f0; font-weight: 800; }

    /* Challenge list */
    .rbc-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
    .ch-card {
        border: 1px solid rgba(148,163,184,0.12); border-radius: 16px; padding: 18px;
        background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 10%, transparent) 0%, rgba(12,16,28,0.6) 55%);
        border-left: 3px solid var(--accent);
        display: flex; flex-direction: column; gap: 14px; transition: transform 0.12s, box-shadow 0.12s;
    }
    .ch-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
    .ch-done { opacity: 0.55; }
    .ch-top { display: flex; align-items: center; gap: 12px; }
    .ch-icon { font-size: 26px; flex-shrink: 0; }
    .ch-name { font-size: 16px; font-weight: 900; color: #f1f5f9; }
    .ch-pips { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
    .pip { width: 8px; height: 8px; border-radius: 50%; background: rgba(148,163,184,0.2); }
    .pip-on { background: var(--accent); }
    .ch-blurb { font-size: 10px; color: #64748b; margin-left: 6px; font-style: italic; }

    .ch-reqs { display: flex; flex-wrap: wrap; gap: 6px; }
    .req-chip { font-size: 10px; font-weight: 700; color: #cbd5e1; background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.15); padding: 3px 9px; border-radius: 100px; }

    .ch-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px; }
    .ch-reward { display: flex; flex-direction: column; }
    .cr-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .cr-pack { font-size: 13px; font-weight: 900; }
    .ch-btn {
        padding: 10px 22px; border-radius: 10px; border: none; cursor: pointer;
        font-size: 12px; font-weight: 900; letter-spacing: 0.5px; white-space: nowrap;
        background: var(--accent); color: #0b1220; transition: transform 0.12s, box-shadow 0.12s;
    }
    .ch-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
    .ch-btn-done { background: rgba(52,211,153,0.12); color: #34d399; cursor: default; }

    /* Overlays */
    .ov { position: fixed; inset: 0; z-index: 80; background: rgba(4,6,14,0.9); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; padding: 16px; }
    .ov-top { z-index: 85; }
    .ov-close { position: absolute; top: 12px; right: 14px; width: 32px; height: 32px; border-radius: 10px; background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.25); color: #94a3b8; font-size: 14px; font-weight: 700; cursor: pointer; }
    .ov-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }

    /* Submission modal */
    .sub-modal { position: relative; width: 100%; max-width: 1000px; max-height: 90vh; overflow-y: auto; padding: 26px; border-radius: 20px; background: linear-gradient(170deg, #0d1224, #0a0f1c); border: 1px solid var(--accent); box-shadow: 0 25px 80px rgba(0,0,0,0.6); }
    .sub-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .sub-icon { font-size: 30px; }
    .sub-name { font-size: 20px; font-weight: 900; color: #f1f5f9; }
    .sub-reward { font-size: 12px; font-weight: 800; margin-top: 2px; }
    .slots { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-bottom: 18px; }
    .slot { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .slot-remove { font-size: 10px; font-weight: 800; color: #f87171; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
    .slot-remove:hover { background: rgba(239,68,68,0.2); }
    .slot-empty { width: 180px; height: 300px; border-radius: 16px; background: rgba(15,23,42,0.4); border: 2px dashed rgba(100,116,139,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; transition: all 0.12s; }
    .slot-empty:hover { border-color: var(--accent); background: rgba(30,41,59,0.4); }
    .se-plus { font-size: 34px; font-weight: 900; color: #475569; }
    .se-label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }

    .checks { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; padding: 14px 18px; border-radius: 12px; background: rgba(15,23,42,0.4); }
    .check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
    .check-ok { color: #34d399; }
    .check-mark { font-weight: 900; width: 16px; text-align: center; }

    .complete-btn { display: block; width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 14px; font-weight: 900; letter-spacing: 0.5px; cursor: pointer; background: linear-gradient(135deg, #059669, #10b981); color: white; transition: box-shadow 0.15s, transform 0.12s; }
    .complete-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(16,185,129,0.3); }
    .complete-btn:disabled { background: rgba(30,41,59,0.6); color: #475569; cursor: not-allowed; }
    .sub-warn { text-align: center; font-size: 10px; color: #64748b; font-style: italic; margin-top: 10px; }

    /* Picker */
    .pick-modal { position: relative; width: 100%; max-width: 1050px; max-height: 88vh; overflow-y: auto; padding: 24px; border-radius: 20px; background: linear-gradient(170deg, #0d1224, #0a0f1c); border: 1px solid rgba(71,85,105,0.25); }
    .pick-head { font-size: 16px; font-weight: 900; color: #e2e8f0; margin-bottom: 16px; }
    .pick-count { font-size: 11px; font-weight: 700; color: #64748b; margin-left: 8px; }
    .pick-empty { color: #475569; font-size: 13px; text-align: center; padding: 40px 0; font-style: italic; }
    .pick-grid { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }

    /* Reward reveal */
    .rew-modal { position: relative; width: 100%; max-width: 1050px; max-height: 90vh; overflow-y: auto; padding: 30px; border-radius: 22px; background: linear-gradient(170deg, #0d1224, #0a0f1c); border: 1px solid rgba(71,85,105,0.25); box-shadow: 0 25px 80px rgba(0,0,0,0.6); text-align: center; }
    .rew-title { font-size: 20px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
    .rew-sub { font-size: 11px; color: #64748b; margin: 4px 0 22px; }
    .rew-grid { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-bottom: 22px; }
    .rew-btn { padding: 12px 34px; border-radius: 12px; border: none; background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; font-size: 13px; font-weight: 900; cursor: pointer; transition: transform 0.12s, box-shadow 0.12s; }
    .rew-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(59,130,246,0.4); }
</style>
