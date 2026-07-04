<script>
    import Card from '../card/Card.svelte';
    import { blueEssence, club, battlePass, dailyLogin, skillPoints, teamIdentity, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, makeUniqueId, TIER_ORDER } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    // === DAILY LOGIN ===
    const DAILY_REWARDS = [
        { day: 1, type: 'be', amount: 200, label: '200 BE', icon: '💎' },
        { day: 2, type: 'be', amount: 300, label: '300 BE', icon: '💎' },
        { day: 3, type: 'be', amount: 500, label: '500 BE', icon: '💎' },
        { day: 4, type: 'card', tier: 'Silver', label: 'Silver Card', icon: '🃏' },
        { day: 5, type: 'be', amount: 800, label: '800 BE', icon: '💎' },
        { day: 6, type: 'bpxp', amount: 500, label: '500 BP XP', icon: '⭐' },
        { day: 7, type: 'card', tier: 'Gold', label: 'Gold Card', icon: '🃏' },
        { day: 8, type: 'be', amount: 400, label: '400 BE', icon: '💎' },
        { day: 9, type: 'be', amount: 600, label: '600 BE', icon: '💎' },
        { day: 10, type: 'sp', amount: 1, label: '1 Skill Point', icon: '⚡' },
        { day: 11, type: 'be', amount: 500, label: '500 BE', icon: '💎' },
        { day: 12, type: 'card', tier: 'Gold', label: 'Gold Card', icon: '🃏' },
        { day: 13, type: 'bpxp', amount: 1000, label: '1000 BP XP', icon: '⭐' },
        { day: 14, type: 'card', tier: 'Platinum', label: 'Platinum Card', icon: '🃏' },
        { day: 15, type: 'be', amount: 1000, label: '1000 BE', icon: '💎' },
        { day: 16, type: 'be', amount: 700, label: '700 BE', icon: '💎' },
        { day: 17, type: 'card', tier: 'Silver', label: 'Silver Card', icon: '🃏' },
        { day: 18, type: 'be', amount: 800, label: '800 BE', icon: '💎' },
        { day: 19, type: 'bpxp', amount: 1500, label: '1500 BP XP', icon: '⭐' },
        { day: 20, type: 'sp', amount: 1, label: '1 Skill Point', icon: '⚡' },
        { day: 21, type: 'be', amount: 1500, label: '1500 BE', icon: '💎' },
        { day: 22, type: 'card', tier: 'Gold', label: 'Gold Card', icon: '🃏' },
        { day: 23, type: 'be', amount: 1000, label: '1000 BE', icon: '💎' },
        { day: 24, type: 'bpxp', amount: 2000, label: '2000 BP XP', icon: '⭐' },
        { day: 25, type: 'card', tier: 'Platinum', label: 'Platinum Card', icon: '🃏' },
        { day: 26, type: 'be', amount: 1200, label: '1200 BE', icon: '💎' },
        { day: 27, type: 'card', tier: 'Diamond', label: 'Diamond Card', icon: '🃏' },
        { day: 28, type: 'sp', amount: 2, label: '2 Skill Points', icon: '⚡' },
    ];

    function isSameDay(d1, d2) {
        if (!d1 || !d2) return false;
        const a = new Date(d1), b = new Date(d2);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    function isYesterday(d1, d2) {
        if (!d1 || !d2) return false;
        const a = new Date(d1), b = new Date(d2);
        a.setDate(a.getDate() + 1);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    $: claimedToday = isSameDay($dailyLogin.lastClaim, Date.now());
    $: currentDay = Math.min(($dailyLogin.totalDays % 28) + 1, 28);
    $: nextReward = DAILY_REWARDS[(currentDay - 1) % 28];

    function giveCard(tier) {
        const db = getDB();
        if (!db) return;
        const pool = db.filter(p => p.quality === tier && p.role !== 'COACH');
        if (pool.length === 0) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const card = { ...pick, uniqueId: makeUniqueId('daily_') };
        club.update(c => [...c, card]);
        collectionRegistry.update(r => ({ ...r, [card.id]: true }));
        showToast(`Received: ${card.name} (${tier})`, 'success');
    }

    function claimDaily() {
        if (claimedToday) return;
        const now = Date.now();
        const last = $dailyLogin.lastClaim;
        let streak = $dailyLogin.streak || 0;
        if (last && isYesterday(last, now)) streak++;
        else if (!last || !isSameDay(last, now)) streak = 1;

        const reward = DAILY_REWARDS[((($dailyLogin.totalDays || 0) % 28))];
        if (reward.type === 'be') blueEssence.update(v => v + reward.amount);
        else if (reward.type === 'sp') skillPoints.update(v => v + reward.amount);
        else if (reward.type === 'card') giveCard(reward.tier);
        else if (reward.type === 'bpxp') battlePass.update(bp => ({ ...bp, xp: (bp.xp || 0) + reward.amount }));

        dailyLogin.set({ lastClaim: now, streak, totalDays: ($dailyLogin.totalDays || 0) + 1 });
        playSound('claim');
        showToast(`Day ${currentDay} claimed! ${reward.label}`, 'success');
        saveGame();
    }

    // === BATTLE PASS ===
    const XP_PER_TIER = 1000;
    const EXTRA_ICONS = ['🐉','🦊','🐻','🎮','🌊','🔥','❄️','⚡','🌙','☀️','💀','🎪','🏴','🦅','🐺','🦁','🐲','👑','🌟','🎯'];
    const EXTRA_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#8b5cf6','#ec4899','#14b8a6','#f43f5e','#6366f1'];

    function buildBPRewards() {
        const rewards = [];
        for (let i = 1; i <= 100; i++) {
            if (i % 10 === 0 && i <= 50) rewards.push({ tier: i, type: 'sp', amount: 1, label: '1 Skill Point', icon: '⚡' });
            else if (i === 55 || i === 75) rewards.push({ tier: i, type: 'sp', amount: 1, label: '1 Skill Point', icon: '⚡' });
            else if (i % 15 === 0) rewards.push({ tier: i, type: 'icon', icon: EXTRA_ICONS[(i/15-1) % EXTRA_ICONS.length], label: 'Team Icon' });
            else if (i % 20 === 0) rewards.push({ tier: i, type: 'color', color: EXTRA_COLORS[(i/20-1) % EXTRA_COLORS.length], label: 'Team Color' });
            else if (i === 25) rewards.push({ tier: i, type: 'card', tier_q: 'Gold', label: 'Gold Card', icon: '🃏' });
            else if (i === 50) rewards.push({ tier: i, type: 'card', tier_q: 'Platinum', label: 'Platinum Card', icon: '🃏' });
            else if (i === 70) rewards.push({ tier: i, type: 'card', tier_q: 'Diamond', label: 'Diamond Card', icon: '🃏' });
            else if (i === 85) rewards.push({ tier: i, type: 'card', tier_q: 'Master', label: 'Master Card', icon: '🃏' });
            else if (i === 95) rewards.push({ tier: i, type: 'card', tier_q: 'Grandmaster', label: 'Grandmaster Card', icon: '🃏' });
            else if (i >= 96) {
                const repBE = [500, 800, 1000, 1500, 2000];
                rewards.push({ tier: i, type: 'be', amount: repBE[(i - 96) % repBE.length], label: `${repBE[(i - 96) % repBE.length]} BE`, icon: '💎', repeatable: true });
            }
            else rewards.push({ tier: i, type: 'be', amount: 100 + i * 15, label: `${100 + i * 15} BE`, icon: '💎' });
        }
        return rewards;
    }
    const BP_REWARDS = buildBPRewards();

    $: bpTier = $battlePass.tier || 0;
    $: bpXP = $battlePass.xp || 0;
    $: bpClaimed = new Set($battlePass.claimed || []);
    $: bpProgress = Math.min(100, (bpXP / XP_PER_TIER) * 100);
    $: canLevelUp = bpXP >= XP_PER_TIER;

    function levelUpBP() {
        if (!canLevelUp) return;
        battlePass.update(bp => ({
            ...bp,
            xp: bp.xp - XP_PER_TIER,
            tier: bp.tier + 1,
        }));
        playSound('claim');
        saveGame();
    }

    function claimBPReward(reward) {
        if (reward.tier > bpTier) return;
        if (bpClaimed.has(reward.tier) && !reward.repeatable) return;
        if (reward.repeatable && reward.tier > bpTier) return;

        if (reward.type === 'be') blueEssence.update(v => v + reward.amount);
        else if (reward.type === 'sp') skillPoints.update(v => v + reward.amount);
        else if (reward.type === 'card') giveCard(reward.tier_q);
        else if (reward.type === 'icon') {
            showToast(`Unlocked icon: ${reward.icon}`, 'success');
        }
        else if (reward.type === 'color') {
            showToast(`Unlocked color!`, 'success');
        }

        battlePass.update(bp => ({ ...bp, claimed: [...(bp.claimed || []), reward.tier] }));
        playSound('claim');
        showToast(`BP Tier ${reward.tier} claimed! ${reward.label}`, 'success');
        saveGame();
    }

    function claimAllBP() {
        const bp = get(battlePass);
        const claimedSet = new Set(bp.claimed || []);
        const currentTier = bp.tier || 0;

        let totalBE = 0, totalSP = 0, cards = [], newClaimed = [...(bp.claimed || [])], count = 0;

        for (const reward of BP_REWARDS) {
            const canClaim = reward.tier <= currentTier && (!claimedSet.has(reward.tier) || reward.repeatable);
            if (!canClaim) continue;
            if (reward.type === 'be') totalBE += reward.amount;
            else if (reward.type === 'sp') totalSP += reward.amount;
            else if (reward.type === 'card') cards.push(reward.tier_q);
            newClaimed.push(reward.tier);
            claimedSet.add(reward.tier);
            count++;
        }

        if (count === 0) { showToast('No rewards to claim!', 'info'); return; }

        if (totalBE > 0) blueEssence.update(v => v + totalBE);
        if (totalSP > 0) skillPoints.update(v => v + totalSP);
        cards.forEach(tier_q => giveCard(tier_q));
        battlePass.update(b => ({ ...b, claimed: newClaimed }));

        playSound('claim');
        let msg = `Claimed ${count} BP reward${count > 1 ? 's' : ''}!`;
        if (totalBE > 0) msg += ` +${totalBE.toLocaleString()} BE`;
        if (totalSP > 0) msg += ` +${totalSP} SP`;
        if (cards.length > 0) msg += ` +${cards.length} card${cards.length > 1 ? 's' : ''}`;
        showToast(msg, 'success');
        saveGame();
    }

    let activeTab = 'daily';
    let bpPage = 0;
    const BP_PER_PAGE = 20;
    $: bpSlice = BP_REWARDS.slice(bpPage * BP_PER_PAGE, (bpPage + 1) * BP_PER_PAGE);
    $: bpPages = Math.ceil(BP_REWARDS.length / BP_PER_PAGE);
    $: claimableCount = BP_REWARDS.filter(r => r.tier <= bpTier && (!bpClaimed.has(r.tier) || r.repeatable)).length;
</script>

<section class="rw-page">
    <div class="rw-head">
        <h2 class="rw-title">Rewards</h2>
        <p class="rw-desc">Claim daily rewards and progress through the Battle Pass.</p>
    </div>

    <!-- Tabs -->
    <div class="rw-tabs">
        <button class="rw-tab" class:rw-tab-on={activeTab === 'daily'} on:click={() => activeTab = 'daily'}>Daily Login</button>
        <button class="rw-tab" class:rw-tab-on={activeTab === 'bp'} on:click={() => activeTab = 'bp'}>Battle Pass</button>
    </div>

    {#if activeTab === 'daily'}
        <!-- DAILY LOGIN -->
        <div class="daily-hero">
            <div class="dh-streak">
                <span class="dh-num">{$dailyLogin.streak || 0}</span>
                <span class="dh-label">Day Streak</span>
            </div>
            <div class="dh-info">
                <span class="dh-total">Total logins: {$dailyLogin.totalDays || 0}</span>
                <span class="dh-cycle">Cycle day: {currentDay}/28</span>
            </div>
            {#if !claimedToday}
                <button class="dh-claim" on:click={claimDaily}>
                    Claim Day {currentDay} — {nextReward?.label || 'Reward'}
                </button>
            {:else}
                <div class="dh-done">✓ Today's reward claimed! Come back tomorrow.</div>
            {/if}
        </div>

        <div class="daily-grid">
            {#each DAILY_REWARDS as r}
                {@const dayNum = r.day}
                {@const claimed = ($dailyLogin.totalDays || 0) % 28 >= dayNum || (($dailyLogin.totalDays || 0) >= 28 && true)}
                {@const isToday = dayNum === currentDay}
                <div class="daily-tile" class:dt-claimed={claimed && !isToday} class:dt-today={isToday} class:dt-future={!claimed && !isToday}>
                    <span class="dt-day">Day {dayNum}</span>
                    <span class="dt-icon">{r.icon}</span>
                    <span class="dt-label">{r.label}</span>
                    {#if claimed && !isToday}
                        <span class="dt-check">✓</span>
                    {/if}
                </div>
            {/each}
        </div>

    {:else}
        <!-- BATTLE PASS -->
        <div class="bp-hero">
            <div class="bp-info">
                <span class="bp-season-label">Season {$battlePass.season}</span>
                <span class="bp-tier-label">Tier {bpTier} / 100</span>
            </div>
            <div class="bp-xp-row">
                <span class="bp-xp-text">{bpXP} / {XP_PER_TIER} XP to next tier</span>
                <div class="bp-xp-bar"><div class="bp-xp-fill" style="width: {bpProgress}%"></div></div>
            </div>
            <p class="bp-hint">Earn XP from Tournaments, Season Splits, Tower, Pack Opens — tiers unlock automatically!</p>
        </div>

        <!-- Claim All + Page Nav -->
        <div class="bp-actions">
            <div class="bp-nav">
                {#each Array(bpPages) as _, p}
                    <button class="bp-nav-btn" class:bp-nav-on={bpPage === p} on:click={() => bpPage = p}>
                        {p * BP_PER_PAGE + 1}-{Math.min((p + 1) * BP_PER_PAGE, 100)}
                    </button>
                {/each}
            </div>
            <button class="bp-claim-all" class:bp-claim-all-pulse={claimableCount > 0} on:click={claimAllBP} disabled={claimableCount === 0}>
                Claim All {#if claimableCount > 0}<span class="bp-ca-badge">{claimableCount}</span>{/if}
            </button>
        </div>

        <div class="bp-grid">
            {#each bpSlice as reward}
                {@const unlocked = reward.tier <= bpTier}
                {@const isClaimed = bpClaimed.has(reward.tier)}
                {@const canClaim = unlocked && (!isClaimed || reward.repeatable)}
                <div class="bp-tile" class:bp-unlocked={unlocked} class:bp-locked={!unlocked} class:bp-rep={reward.repeatable}>
                    <span class="bpt-tier">{reward.tier}</span>
                    <span class="bpt-icon">{reward.icon || '🎁'}</span>
                    <span class="bpt-label">{reward.label}</span>
                    {#if reward.repeatable}<span class="bpt-rep">∞</span>{/if}
                    {#if canClaim}
                        <button class="bpt-claim" on:click={() => claimBPReward(reward)}>Claim</button>
                    {:else if isClaimed && !reward.repeatable}
                        <span class="bpt-done">✓</span>
                    {:else}
                        <span class="bpt-lock">🔒</span>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</section>

<style>
    .rw-page { max-width: 1000px; margin: 0 auto; padding-bottom: 40px; }
    .rw-head { margin-bottom: 16px; }
    .rw-title { font-size: 22px; font-weight: 900; color: #fbbf24; }
    .rw-desc { font-size: 12px; color: #64748b; margin-top: 3px; }

    .rw-tabs { display: flex; gap: 4px; margin-bottom: 20px; }
    .rw-tab {
        flex: 1; padding: 12px; border-radius: 12px; text-align: center;
        font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.2);
        color: #64748b; cursor: pointer; transition: all 0.12s;
    }
    .rw-tab:hover { color: #e2e8f0; }
    .rw-tab-on { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.2); color: #fbbf24; }

    /* Daily Login */
    .daily-hero {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(251,191,36,0.12);
        border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;
    }
    .dh-streak { margin-bottom: 8px; }
    .dh-num { font-size: 36px; font-weight: 900; color: #fbbf24; }
    .dh-label { display: block; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
    .dh-info { display: flex; justify-content: center; gap: 20px; margin-bottom: 16px; }
    .dh-total, .dh-cycle { font-size: 11px; color: #475569; }
    .dh-claim {
        padding: 14px 32px; border-radius: 12px;
        background: linear-gradient(135deg, #d97706, #f59e0b); color: #1c1917;
        font-weight: 900; font-size: 13px; border: none; cursor: pointer;
        box-shadow: 0 4px 15px rgba(245,158,11,0.25); transition: all 0.15s;
    }
    .dh-claim:hover { box-shadow: 0 6px 20px rgba(245,158,11,0.4); transform: translateY(-1px); }
    .dh-done { font-size: 13px; font-weight: 800; color: #34d399; }

    .daily-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
    @media (max-width: 700px) { .daily-grid { grid-template-columns: repeat(4, 1fr); } }
    .daily-tile {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 12px 4px; border-radius: 12px; text-align: center;
        background: rgba(12,16,28,0.4); border: 1px solid rgba(51,65,85,0.15);
        position: relative;
    }
    .dt-today { border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.06); }
    .dt-claimed { opacity: 0.35; }
    .dt-future { opacity: 0.5; }
    .dt-day { font-size: 8px; font-weight: 900; color: #475569; text-transform: uppercase; }
    .dt-icon { font-size: 20px; }
    .dt-label { font-size: 9px; font-weight: 700; color: #94a3b8; }
    .dt-check { position: absolute; top: 4px; right: 4px; font-size: 10px; color: #34d399; }

    /* Battle Pass */
    .bp-hero {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(99,102,241,0.12);
        border-radius: 16px; padding: 24px; margin-bottom: 16px;
    }
    .bp-info { display: flex; justify-content: space-between; margin-bottom: 12px; }
    .bp-season-label { font-size: 14px; font-weight: 900; color: #818cf8; }
    .bp-tier-label { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .bp-xp-row { display: flex; align-items: center; gap: 10px; }
    .bp-xp-text { font-size: 11px; font-weight: 800; color: #64748b; white-space: nowrap; }
    .bp-xp-bar { flex: 1; height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .bp-xp-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #818cf8); border-radius: 4px; transition: width 0.3s; }
    .bp-lvl-btn {
        padding: 6px 16px; border-radius: 8px;
        background: linear-gradient(135deg, #6366f1, #818cf8); color: white;
        font-size: 11px; font-weight: 900; border: none; cursor: pointer;
        animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { box-shadow: 0 0 8px rgba(99,102,241,0.3); } 50% { box-shadow: 0 0 20px rgba(99,102,241,0.6); } }
    .bp-hint { font-size: 9px; color: #334155; margin-top: 10px; }

    .bp-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .bp-nav { display: flex; gap: 4px; flex-wrap: wrap; }
    .bp-claim-all {
        padding: 8px 18px; border-radius: 10px; display: flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, #6366f1, #818cf8); color: white;
        font-size: 11px; font-weight: 900; border: none; cursor: pointer;
        transition: all 0.15s; white-space: nowrap;
    }
    .bp-claim-all:disabled { opacity: 0.35; cursor: default; background: rgba(30,41,59,0.4); }
    .bp-claim-all-pulse { animation: pulse 1.5s ease-in-out infinite; }
    .bp-ca-badge {
        background: rgba(255,255,255,0.25); border-radius: 999px;
        padding: 1px 7px; font-size: 10px; font-weight: 900;
    }
    .bp-nav-btn {
        padding: 6px 12px; border-radius: 8px; font-size: 10px; font-weight: 800;
        background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.2);
        color: #64748b; cursor: pointer; transition: all 0.12s;
    }
    .bp-nav-btn:hover { color: #e2e8f0; }
    .bp-nav-on { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); color: #818cf8; }

    .bp-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    @media (max-width: 700px) { .bp-grid { grid-template-columns: repeat(3, 1fr); } }
    .bp-tile {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 14px 6px; border-radius: 12px; text-align: center;
        background: rgba(12,16,28,0.4); border: 1px solid rgba(51,65,85,0.15);
        position: relative;
    }
    .bp-unlocked { border-color: rgba(99,102,241,0.2); background: rgba(99,102,241,0.04); }
    .bp-locked { opacity: 0.35; }
    .bp-rep { border-color: rgba(251,191,36,0.2); }
    .bpt-tier { font-size: 9px; font-weight: 900; color: #475569; }
    .bpt-icon { font-size: 20px; }
    .bpt-label { font-size: 9px; font-weight: 700; color: #94a3b8; }
    .bpt-rep { font-size: 8px; color: #fbbf24; font-weight: 900; }
    .bpt-claim {
        padding: 4px 12px; border-radius: 6px;
        background: linear-gradient(135deg, #6366f1, #818cf8); color: white;
        font-size: 9px; font-weight: 900; border: none; cursor: pointer; transition: all 0.12s;
    }
    .bpt-claim:hover { transform: scale(1.05); }
    .bpt-done { font-size: 10px; color: #34d399; }
    .bpt-lock { font-size: 10px; opacity: 0.3; }
</style>
