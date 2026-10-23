<script>
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { blueEssence, club, battlePass, dailyLogin, skillPoints, teamIdentity, collectionRegistry, freePacks, grantBE, grantBPXP, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, makeUniqueId, TIER_COLORS } from '../../utils/cards.js';
    import { msUntilReset } from '../../utils/rbc.js';
    import { BP_REWARDS, XP_PER_TIER, MAX_TIER, isFeatured, claimsLeft, claimableCount } from '../../utils/battlepass.js';
    import { get } from 'svelte/store';
    import { onMount, onDestroy, tick } from 'svelte';

    // === DAILY LOGIN ===
    const DAILY_REWARDS = [
        { day: 1, type: 'be', amount: 200, label: '200 BE' },
        { day: 2, type: 'be', amount: 300, label: '300 BE' },
        { day: 3, type: 'be', amount: 500, label: '500 BE' },
        { day: 4, type: 'card', tier: 'Silver', label: 'Silver Card' },
        { day: 5, type: 'be', amount: 800, label: '800 BE' },
        { day: 6, type: 'bpxp', amount: 500, label: '500 BP XP' },
        { day: 7, type: 'card', tier: 'Gold', label: 'Gold Card' },
        { day: 8, type: 'be', amount: 400, label: '400 BE' },
        { day: 9, type: 'be', amount: 600, label: '600 BE' },
        { day: 10, type: 'sp', amount: 1, label: '1 Skill Point' },
        { day: 11, type: 'be', amount: 500, label: '500 BE' },
        { day: 12, type: 'card', tier: 'Gold', label: 'Gold Card' },
        { day: 13, type: 'bpxp', amount: 1000, label: '1000 BP XP' },
        { day: 14, type: 'card', tier: 'Platinum', label: 'Platinum Card' },
        { day: 15, type: 'be', amount: 1000, label: '1000 BE' },
        { day: 16, type: 'be', amount: 700, label: '700 BE' },
        { day: 17, type: 'card', tier: 'Silver', label: 'Silver Card' },
        { day: 18, type: 'be', amount: 800, label: '800 BE' },
        { day: 19, type: 'bpxp', amount: 1500, label: '1500 BP XP' },
        { day: 20, type: 'sp', amount: 1, label: '1 Skill Point' },
        { day: 21, type: 'be', amount: 1500, label: '1500 BE' },
        { day: 22, type: 'card', tier: 'Gold', label: 'Gold Card' },
        { day: 23, type: 'be', amount: 1000, label: '1000 BE' },
        { day: 24, type: 'bpxp', amount: 2000, label: '2000 BP XP' },
        { day: 25, type: 'card', tier: 'Platinum', label: 'Platinum Card' },
        { day: 26, type: 'be', amount: 1200, label: '1200 BE' },
        { day: 27, type: 'card', tier: 'Diamond', label: 'Diamond Card' },
        { day: 28, type: 'sp', amount: 2, label: '2 Skill Points' },
    ];
    const DAILY_WEEKS = [0, 1, 2, 3].map(w => DAILY_REWARDS.slice(w * 7, w * 7 + 7));
    const TYPE_ICON = { be: 'gem', sp: 'bolt', card: 'cards', bpxp: 'star', pack: 'store', icon: 'sparkle', color: 'palette' };
    const TYPE_COLOR = { be: '#7dd3fc', sp: '#fde047', bpxp: '#c4b5fd', pack: '#fb923c', icon: '#f9a8d4', color: '#f9a8d4' };
    function rewardColor(r) { return r.type === 'card' ? (TIER_COLORS[r.tier || r.tier_q] || '#94a3b8') : r.type === 'color' ? r.color : TYPE_COLOR[r.type] || '#94a3b8'; }

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

    let nowTs = Date.now();
    const ticker = setInterval(() => { nowTs = Date.now(); }, 1000);
    onDestroy(() => clearInterval(ticker));

    $: claimedToday = isSameDay($dailyLogin.lastClaim, nowTs);
    $: totalDays = $dailyLogin.totalDays || 0;
    $: currentDay = Math.min((totalDays % 28) + 1, 28);
    $: nextReward = DAILY_REWARDS[(currentDay - 1) % 28];
    // Where today sits in the 28-day cycle. The old calendar marked every tile claimed once
    // you passed 28 logins, because it tested totalDays >= 28 rather than the cycle.
    $: doneInCycle = claimedToday ? ((totalDays - 1) % 28) + 1 : totalDays % 28;
    $: todayDay = claimedToday ? doneInCycle : doneInCycle + 1;
    function dayState(d) {
        if (d < todayDay) return 'claimed';
        if (d === todayDay) return claimedToday ? 'today-done' : 'today';
        if (claimedToday && d === todayDay + 1) return 'tomorrow';
        return 'future';
    }
    $: resetIn = (() => {
        const s = Math.floor(msUntilReset(nowTs) / 1000);
        return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
    })();
    $: streak = $dailyLogin.streak || 0;
    $: streakBonusNext = Math.min((claimedToday ? streak : streak + 1), 30) * 50;

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
        let streakN = $dailyLogin.streak || 0;
        if (last && isYesterday(last, now)) streakN++;
        else if (!last || !isSameDay(last, now)) streakN = 1;

        const reward = DAILY_REWARDS[((($dailyLogin.totalDays || 0) % 28))];
        // Escalating streak bonus: +50 BE per consecutive day, capped at a 30-day streak (+1500 BE).
        const streakBonus = Math.min(streakN, 30) * 50;
        let beGain = streakBonus;
        if (reward.type === 'be') beGain += reward.amount;
        else if (reward.type === 'sp') skillPoints.update(v => v + reward.amount);
        else if (reward.type === 'card') giveCard(reward.tier);
        // Through grantBPXP so a big XP day levels the pass straight away, instead of
        // parking 2,000 XP in the bar until something else happened to award XP.
        else if (reward.type === 'bpxp') grantBPXP(reward.amount);
        // Route the day's BE + streak bonus through Wealth Management
        grantBE(beGain);

        dailyLogin.set({ lastClaim: now, streak: streakN, totalDays: ($dailyLogin.totalDays || 0) + 1 });
        playSound('claim');
        showToast(`Day ${currentDay} claimed! ${reward.label} · +${streakBonus} BE streak bonus (${streakN} days)`, 'success');
        saveGame();
    }

    // === BATTLE PASS ===
    $: bpTier = $battlePass.tier || 0;
    $: bpXP = $battlePass.xp || 0;
    $: bpProgress = Math.min(100, (bpXP / XP_PER_TIER) * 100);
    $: claimable = claimableCount($battlePass);
    function left(r) { return claimsLeft(r, $battlePass); }

    // Pays one reward (and the extra some tiers carry). Returns a summary so Claim All can
    // add everything up into a single toast.
    function grant(r, sum) {
        const items = r.extra ? [r, r.extra] : [r];
        for (const it of items) {
            if (it.type === 'be') { blueEssence.update(v => v + it.amount); sum.be += it.amount; }
            else if (it.type === 'sp') { skillPoints.update(v => v + it.amount); sum.sp += it.amount; }
            else if (it.type === 'card') { giveCard(it.tier_q); sum.cards++; }
            else if (it.type === 'pack') { freePacks.update(fp => ({ ...fp, [it.pack]: (fp[it.pack] || 0) + it.count })); sum.packs += it.count; }
            else if (it.type === 'icon') { teamIdentity.update(t => ({ ...t, unlockedIcons: [...new Set([...(t.unlockedIcons || []), it.icon])] })); sum.cosmetics++; }
            else if (it.type === 'color') { teamIdentity.update(t => ({ ...t, unlockedColors: [...new Set([...(t.unlockedColors || []), it.color])] })); sum.cosmetics++; }
        }
    }
    const emptySum = () => ({ be: 0, sp: 0, cards: 0, packs: 0, cosmetics: 0 });
    function describe(sum) {
        const bits = [];
        if (sum.be) bits.push(`+${sum.be.toLocaleString()} BE`);
        if (sum.sp) bits.push(`+${sum.sp} SP`);
        if (sum.cards) bits.push(`${sum.cards} card${sum.cards > 1 ? 's' : ''}`);
        if (sum.packs) bits.push(`${sum.packs} free pack${sum.packs > 1 ? 's' : ''}`);
        if (sum.cosmetics) bits.push(`${sum.cosmetics} cosmetic${sum.cosmetics > 1 ? 's' : ''}`);
        return bits.join(' · ');
    }

    function claimBPReward(reward) {
        if (claimsLeft(reward, get(battlePass)) <= 0) return;
        const sum = emptySum();
        grant(reward, sum);
        battlePass.update(bp => ({ ...bp, claimed: [...(bp.claimed || []), reward.tier] }));
        playSound('claim');
        showToast(`Tier ${reward.tier} claimed! ${describe(sum)}`, 'success');
        saveGame();
    }

    function claimAllBP() {
        const bp = get(battlePass);
        const newClaimed = [...(bp.claimed || [])];
        const sum = emptySum();
        let count = 0;
        for (const r of BP_REWARDS) {
            const n = claimsLeft(r, bp);
            for (let i = 0; i < n; i++) { grant(r, sum); newClaimed.push(r.tier); count++; }
        }
        if (count === 0) { showToast('No rewards to claim!', 'info'); return; }
        battlePass.update(b => ({ ...b, claimed: newClaimed }));
        playSound('rare');
        showToast(`Claimed ${count} Battle Pass reward${count > 1 ? 's' : ''}! ${describe(sum)}`, 'success');
        saveGame();
    }

    // === Navigation ===
    let activeTab = 'daily';
    let track;
    const NODE_W = 104;     // must match .node width in the CSS below

    async function showTab(t) {
        activeTab = t;
        if (t === 'bp') { await tick(); scrollToTier(Math.max(1, bpTier), false); }
    }
    function scrollToTier(t, smooth = true) {
        if (!track) return;
        const left = Math.max(0, (t - 1) * NODE_W - track.clientWidth / 2 + NODE_W / 2);
        track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    }
    // A vertical wheel over the track scrolls it sideways — otherwise the only way through
    // a 100-tier track on a mouse is the scrollbar.
    function onWheel(e) {
        if (!track || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        const max = track.scrollWidth - track.clientWidth;
        if ((e.deltaY < 0 && track.scrollLeft <= 0) || (e.deltaY > 0 && track.scrollLeft >= max)) return;
        e.preventDefault();
        track.scrollLeft += e.deltaY;
    }
    $: nextFeatured = BP_REWARDS.filter(r => isFeatured(r) && r.tier > bpTier).slice(0, 4);
    $: firstClaimable = BP_REWARDS.find(r => left(r) > 0) || null;
    const DECADES = Array.from({ length: MAX_TIER / 10 }, (_, i) => i * 10 + 1);
    $: decadeClaimable = ((_bp) => DECADES.map(d => BP_REWARDS.slice(d - 1, d + 9).reduce((n, r) => n + left(r), 0)))($battlePass);

    onMount(() => { if (activeTab === 'bp') scrollToTier(Math.max(1, bpTier), false); });
</script>

<section class="rw">
    <header class="rw-head">
        <span class="rw-eyebrow"><Icon name="gift" size={12} stroke={2.2} /> Rewards</span>
        <h2 class="rw-title">Rewards</h2>
    </header>

    <!-- Two summary cards. Each is also the tab for its section, and each carries its own
         main action so you can claim without switching. -->
    <div class="sum" role="tablist">
        <div class="sc sc-daily" class:sc-on={activeTab === 'daily'} role="tab" tabindex="0" aria-selected={activeTab === 'daily'}
             on:click={() => showTab('daily')} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTab('daily'); } }}>
            <div class="sc-flame" class:sc-flame-lit={streak > 0}>
                <Icon name="flame" size={30} stroke={1.8} />
                <span class="sc-streak">{streak}</span>
            </div>
            <div class="sc-body">
                <span class="sc-kicker">Daily login · day {todayDay} of 28</span>
                <span class="sc-title">{streak > 0 ? `${streak}-day streak` : 'Start a streak'}</span>
                <span class="sc-sub">{claimedToday ? `Claimed today — next reward in ${resetIn}` : `Today: ${nextReward.label} + ${streakBonusNext} BE streak bonus`}</span>
            </div>
            {#if !claimedToday}
                <button class="sc-btn sc-btn-gold" on:click|stopPropagation={claimDaily} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>Claim day {currentDay}</button>
            {:else}
                <span class="sc-done"><Icon name="check" size={14} stroke={2.6} /> Done</span>
            {/if}
        </div>

        <div class="sc sc-bp" class:sc-on={activeTab === 'bp'} role="tab" tabindex="0" aria-selected={activeTab === 'bp'}
             on:click={() => showTab('bp')} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTab('bp'); } }}>
            <div class="sc-tier">
                <span class="sc-tier-n">{bpTier}</span>
                <span class="sc-tier-l">tier</span>
            </div>
            <div class="sc-body">
                <span class="sc-kicker">Battle Pass · Season {$battlePass.season}</span>
                <span class="sc-title">{bpTier >= MAX_TIER ? 'Pass complete' : `Tier ${bpTier + 1} in ${(XP_PER_TIER - bpXP).toLocaleString()} XP`}</span>
                <div class="sc-xp"><div class="sc-xp-fill" style="width: {bpProgress}%;"></div></div>
            </div>
            {#if claimable > 0}
                <button class="sc-btn sc-btn-purple" on:click|stopPropagation={claimAllBP} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>Claim all · {claimable}</button>
            {:else}
                <span class="sc-done sc-done-dim">Nothing to claim</span>
            {/if}
        </div>
    </div>

    {#if activeTab === 'daily'}
        <!-- DAILY CALENDAR -->
        <div class="cal">
            {#each DAILY_WEEKS as week, w}
                <div class="week">
                    <span class="week-lbl">Week {w + 1}</span>
                    <div class="week-days">
                        {#each week as r (r.day)}
                            {@const st = dayState(r.day)}
                            <div class="day day-{st}" class:day-big={r.day % 7 === 0} style="--c: {rewardColor(r)};">
                                <span class="day-n">Day {r.day}</span>
                                <span class="day-ico"><Icon name={TYPE_ICON[r.type]} size={r.day % 7 === 0 ? 24 : 19} /></span>
                                <span class="day-lbl">{r.label}</span>
                                {#if st === 'claimed' || st === 'today-done'}<span class="day-check"><Icon name="check" size={11} stroke={3} /></span>{/if}
                                {#if st === 'today'}<span class="day-tag">Today</span>{/if}
                                {#if st === 'tomorrow'}<span class="day-tag day-tag-dim">Tomorrow</span>{/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
        <p class="note"><Icon name="flame" size={13} /> Every consecutive day adds +50 BE on top of the day's reward, up to +1,500 BE at a 30-day streak. Miss a day and the streak starts again; the calendar keeps going.</p>

    {:else}
        <!-- BATTLE PASS TRACK -->
        <div class="bp-nav">
            <div class="decades">
                {#each DECADES as d, i}
                    <button class="dec" class:dec-cur={bpTier >= d && bpTier < d + 10} class:dec-done={bpTier >= d + 9} on:click={() => scrollToTier(d + 4)}>
                        {d}–{d + 9}
                        {#if decadeClaimable[i] > 0}<span class="dec-dot"></span>{/if}
                    </button>
                {/each}
            </div>
            <div class="bp-jumps">
                <button class="jump" on:click={() => scrollToTier(Math.max(1, bpTier))}><Icon name="target" size={14} /> My tier</button>
                {#if firstClaimable}<button class="jump jump-hot" on:click={() => scrollToTier(firstClaimable.tier)}><Icon name="gift" size={14} /> First unclaimed</button>{/if}
            </div>
        </div>

        <div class="track" bind:this={track} on:wheel={onWheel}>
            <div class="rail" style="width: {MAX_TIER * NODE_W}px;">
                <div class="rail-fill" style="width: {Math.max(0, Math.min(MAX_TIER, bpTier) * NODE_W - NODE_W / 2)}px;"></div>
            </div>
            {#each BP_REWARDS as r (r.tier)}
                {@const n = left(r)}
                {@const unlocked = r.tier <= bpTier}
                {@const done = unlocked && n === 0 && !r.repeatable}
                <div class="node" class:node-unlocked={unlocked} class:node-cur={r.tier === bpTier} class:node-feat={isFeatured(r) || r.extra}>
                    <span class="node-tier">{r.tier}</span>
                    <span class="node-pip">{#if done}<Icon name="check" size={10} stroke={3} />{/if}</span>
                    <div class="rtile" class:rtile-ready={n > 0} class:rtile-done={done} style="--c: {rewardColor(r)};">
                        {#if r.type === 'icon'}
                            <span class="rt-emoji">{r.icon}</span>
                        {:else if r.type === 'color'}
                            <span class="rt-swatch" style="background: {r.color};"></span>
                        {:else}
                            <span class="rt-ico"><Icon name={TYPE_ICON[r.type]} size={isFeatured(r) ? 24 : 18} /></span>
                        {/if}
                        <span class="rt-lbl">{r.label}</span>
                        {#if r.extra}<span class="rt-extra">+ {r.extra.label}</span>{/if}
                        {#if r.repeatable}<span class="rt-rep" title="Repeats every 5 tiers past 100">∞</span>{/if}
                        {#if n > 0}
                            <button class="rt-claim" on:click={() => claimBPReward(r)}>Claim{n > 1 ? ` ×${n}` : ''}</button>
                        {:else if !unlocked}
                            <span class="rt-lock"><Icon name="lock" size={11} /></span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <div class="bp-bottom">
            <section class="upnext">
                <h3 class="un-title">Coming up</h3>
                {#if nextFeatured.length === 0}
                    <p class="note">Every featured reward is unlocked. Tiers 96–100 keep paying Blue Essence every five tiers past the cap.</p>
                {:else}
                    <div class="un-list">
                        {#each nextFeatured as r (r.tier)}
                            <button class="un" style="--c: {rewardColor(r)};" on:click={() => scrollToTier(r.tier)}>
                                <span class="un-ico">{#if r.type === 'icon'}{r.icon}{:else if r.type === 'color'}<span class="rt-swatch rt-swatch-sm" style="background: {r.color};"></span>{:else}<Icon name={TYPE_ICON[r.type]} size={18} />{/if}</span>
                                <span class="un-text"><span class="un-lbl">{r.label}{r.extra ? ` + ${r.extra.label}` : ''}</span><span class="un-sub">Tier {r.tier} · {r.tier - bpTier} tier{r.tier - bpTier === 1 ? '' : 's'} away</span></span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </section>
            <section class="howto">
                <h3 class="un-title">How to earn XP</h3>
                <ul class="howto-list">
                    <li><Icon name="trophy" size={14} /> Tournaments and Season splits</li>
                    <li><Icon name="store" size={14} /> Opening packs (30 XP each)</li>
                    <li><Icon name="puzzle" size={14} /> Roster Building Challenges</li>
                    <li><Icon name="calendar" size={14} /> Daily login days 6, 13, 19 and 24</li>
                </ul>
                <p class="note-text">Free packs from the pass land in the <button class="inline-link" on:click={() => switchTab('store')}>Store</button>; crests and colours unlock in your team editor on Home.</p>
            </section>
        </div>
    {/if}
</section>

<style>
    .rw { max-width: 1200px; margin: 0 auto; padding-bottom: 40px; display: flex; flex-direction: column; gap: 18px; }
    .rw-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #f472b6; }
    .rw-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 4px; }

    /* Summary cards */
    .sum { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .sc {
        position: relative; display: flex; align-items: center; gap: 18px; cursor: pointer;
        padding: 18px 20px; border-radius: 22px; border: 1px solid rgba(71,85,105,0.3);
        background: rgba(12,16,28,0.65); transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
    }
    .sc:hover { transform: translateY(-2px); }
    .sc-daily.sc-on { border-color: rgba(251,146,60,0.6); background: radial-gradient(70% 140% at 0% 50%, rgba(251,146,60,0.2), transparent 65%), rgba(12,16,28,0.7); box-shadow: 0 12px 30px rgba(251,146,60,0.12); }
    .sc-bp.sc-on { border-color: rgba(168,85,247,0.6); background: radial-gradient(70% 140% at 0% 50%, rgba(168,85,247,0.22), transparent 65%), rgba(12,16,28,0.7); box-shadow: 0 12px 30px rgba(168,85,247,0.14); }
    .sc-flame { position: relative; width: 64px; height: 64px; flex-shrink: 0; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: #475569; background: rgba(30,41,59,0.6); }
    .sc-flame-lit { color: #fb923c; background: radial-gradient(circle at 50% 70%, rgba(251,146,60,0.35), rgba(127,29,29,0.25)); box-shadow: 0 0 22px rgba(251,146,60,0.3); }
    .sc-streak { position: absolute; bottom: -6px; right: -6px; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 100px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #1c0f05; background: #fdba74; border: 3px solid #0b0f1c; }
    .sc-tier { width: 64px; height: 64px; flex-shrink: 0; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(150deg, #7c3aed, #4c1d95); box-shadow: 0 0 22px rgba(124,58,237,0.4); }
    .sc-tier-n { font-size: 24px; font-weight: 900; color: #fff; line-height: 1; }
    .sc-tier-l { font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #ddd6fe; }
    .sc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .sc-kicker { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; }
    .sc-title { font-size: 18px; font-weight: 900; color: #f8fafc; }
    .sc-sub { font-size: 12px; color: #94a3b8; }
    .sc-xp { height: 8px; border-radius: 8px; background: rgba(30,41,59,0.9); overflow: hidden; margin-top: 4px; }
    .sc-xp-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #7c3aed, #c084fc); box-shadow: 0 0 10px rgba(192,132,252,0.6); transition: width 0.4s; }
    .sc-btn { position: relative; overflow: hidden; flex-shrink: 0; padding: 12px 18px; border-radius: 14px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; white-space: nowrap; }
    .sc-btn-gold { color: #1c0f05; background: linear-gradient(135deg, #fde68a, #f59e0b); box-shadow: 0 6px 20px rgba(245,158,11,0.4); animation: scPulseGold 2.2s ease-in-out infinite; }
    .sc-btn-purple { color: #fff; background: linear-gradient(135deg, #a855f7, #6d28d9); box-shadow: 0 6px 20px rgba(139,92,246,0.45); animation: scPulsePurple 2.2s ease-in-out infinite; }
    @keyframes scPulseGold { 50% { box-shadow: 0 6px 30px rgba(245,158,11,0.7); } }
    @keyframes scPulsePurple { 50% { box-shadow: 0 6px 30px rgba(168,85,247,0.75); } }
    .sc-btn:hover { transform: translateY(-1px); }
    .sc-done { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 900; color: #34d399; padding: 8px 12px; border-radius: 12px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25); }
    .sc-done-dim { color: #64748b; background: rgba(30,41,59,0.5); border-color: rgba(71,85,105,0.3); }

    /* Daily calendar */
    .cal { display: flex; flex-direction: column; gap: 10px; }
    .week { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 12px; }
    .week-lbl { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; }
    .week-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
    .day {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center;
        padding: 12px 6px 11px; border-radius: 16px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--c) 9%, rgba(15,23,42,0.7)), rgba(12,16,28,0.75));
        border: 1px solid color-mix(in srgb, var(--c) 18%, rgba(71,85,105,0.25));
    }
    .day-big { background: linear-gradient(180deg, color-mix(in srgb, var(--c) 18%, rgba(15,23,42,0.7)), rgba(12,16,28,0.75)); border-color: color-mix(in srgb, var(--c) 40%, transparent); }
    .day-n { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .day-ico { color: var(--c); display: flex; }
    .day-lbl { font-size: 11px; font-weight: 800; color: #cbd5e1; line-height: 1.2; }
    .day-check { position: absolute; top: 6px; right: 6px; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #052e16; background: #34d399; }
    .day-tag { position: absolute; bottom: -8px; font-size: 8.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 2px 8px; border-radius: 100px; color: #1c0f05; background: #fbbf24; }
    .day-tag-dim { color: #cbd5e1; background: #334155; }
    .day-claimed { opacity: 0.45; }
    .day-today { border-color: #fbbf24; box-shadow: 0 0 0 1px #fbbf24, 0 0 24px rgba(251,191,36,0.3); transform: translateY(-2px); }
    .day-today-done { border-color: rgba(52,211,153,0.6); box-shadow: 0 0 18px rgba(52,211,153,0.2); }
    .day-tomorrow { border-style: dashed; border-color: rgba(148,163,184,0.5); }
    .day-future { opacity: 0.85; }
    .note { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: #7c8aa0; line-height: 1.5; }
    .note :global(svg) { flex-shrink: 0; margin-top: 2px; color: #fb923c; }
    .note-text { font-size: 12px; color: #7c8aa0; line-height: 1.5; }

    /* Battle pass navigation */
    .bp-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .decades { display: flex; gap: 4px; flex-wrap: wrap; }
    .dec { position: relative; padding: 6px 10px; border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 800; color: #94a3b8; background: rgba(15,23,42,0.6); border: 1px solid rgba(71,85,105,0.3); font-variant-numeric: tabular-nums; }
    .dec:hover { color: #f1f5f9; }
    .dec-done { color: #c4b5fd; border-color: rgba(139,92,246,0.3); }
    .dec-cur { color: #fff; background: rgba(124,58,237,0.3); border-color: #a78bfa; }
    .dec-dot { position: absolute; top: -3px; right: -3px; width: 9px; height: 9px; border-radius: 50%; background: #ef4444; border: 2px solid #0b0f1c; }
    .bp-jumps { display: flex; gap: 6px; }
    .jump { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 800; color: #e2e8f0; background: rgba(30,41,59,0.6); border: 1px solid rgba(100,116,139,0.35); }
    .jump:hover { background: rgba(51,65,85,0.7); }
    .jump-hot { color: #fde68a; border-color: rgba(251,191,36,0.4); }

    /* The track */
    .track {
        position: relative; display: flex; overflow-x: auto; overflow-y: hidden;
        padding: 18px 0 18px; border-radius: 22px;
        background: radial-gradient(100% 70% at 50% 0%, rgba(124,58,237,0.12), transparent 70%), rgba(10,13,24,0.7);
        border: 1px solid rgba(139,92,246,0.25);
        scrollbar-width: thin;
    }
    /* Sits through the centre of the tier pips: 18px track padding + 14px tier label + 6px gap. */
    .rail { position: absolute; left: 0; top: 45px; height: 4px; background: rgba(51,65,85,0.6); }
    .rail-fill { height: 100%; background: linear-gradient(90deg, #7c3aed, #c084fc); box-shadow: 0 0 10px rgba(192,132,252,0.7); }
    .node { position: relative; flex: 0 0 104px; width: 104px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 5px; }
    .node-tier { font-size: 11px; font-weight: 900; color: #64748b; font-variant-numeric: tabular-nums; }
    .node-unlocked .node-tier { color: #c4b5fd; }
    .node-pip { position: relative; z-index: 1; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #1e293b; border: 3px solid #0b0f1c; color: #fff; }
    .node-unlocked .node-pip { background: #8b5cf6; }
    .node-cur .node-pip { width: 22px; height: 22px; background: #fff; box-shadow: 0 0 0 4px rgba(192,132,252,0.5), 0 0 16px #c084fc; }
    .node-cur .node-tier { color: #fff; }

    .rtile {
        position: relative; width: 100%; min-height: 118px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; text-align: center;
        padding: 12px 6px 10px; border-radius: 16px; margin-top: 4px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--c) 9%, rgba(15,23,42,0.85)), rgba(11,14,26,0.9));
        border: 1px solid color-mix(in srgb, var(--c) 16%, rgba(71,85,105,0.3));
    }
    .node-feat .rtile { background: linear-gradient(180deg, color-mix(in srgb, var(--c) 22%, rgba(15,23,42,0.85)), rgba(11,14,26,0.9)); border-color: color-mix(in srgb, var(--c) 45%, transparent); box-shadow: 0 0 18px color-mix(in srgb, var(--c) 14%, transparent); }
    .node:not(.node-unlocked) .rtile { opacity: 0.6; }
    .rt-ico { color: var(--c); display: flex; }
    .rt-emoji { font-size: 26px; line-height: 1; }
    .rt-swatch { width: 26px; height: 26px; border-radius: 8px; border: 2px solid rgba(255,255,255,0.6); box-shadow: 0 0 12px rgba(255,255,255,0.2); }
    .rt-swatch-sm { display: inline-block; width: 18px; height: 18px; border-radius: 6px; }
    .rt-lbl { font-size: 10.5px; font-weight: 800; color: #cbd5e1; line-height: 1.2; }
    .rt-extra { font-size: 9.5px; font-weight: 900; color: #fdba74; }
    .rt-rep { position: absolute; top: 5px; right: 8px; font-size: 12px; font-weight: 900; color: #fbbf24; }
    .rt-lock { color: #475569; display: flex; }
    .rt-claim { margin-top: 2px; padding: 5px 12px; border-radius: 9px; border: none; cursor: pointer; font-size: 10.5px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #a855f7, #6d28d9); box-shadow: 0 4px 12px rgba(139,92,246,0.45); }
    .rt-claim:hover { transform: translateY(-1px); }
    .rtile-ready { border-color: #a78bfa; box-shadow: 0 0 0 1px rgba(167,139,250,0.6), 0 0 22px rgba(139,92,246,0.35); animation: rtGlow 2s ease-in-out infinite; }
    @keyframes rtGlow { 50% { box-shadow: 0 0 0 1px rgba(196,181,253,0.9), 0 0 30px rgba(139,92,246,0.55); } }
    .rtile-done { opacity: 0.5; }

    /* Below the track */
    .bp-bottom { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; }
    .upnext, .howto { padding: 16px 18px; border-radius: 20px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .un-title { font-size: 12px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; color: #cbd5e1; margin-bottom: 10px; }
    .un-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .un { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; cursor: pointer; text-align: left; background: color-mix(in srgb, var(--c) 8%, rgba(15,23,42,0.6)); border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); }
    .un:hover { border-color: color-mix(in srgb, var(--c) 55%, transparent); }
    .un-ico { width: 36px; height: 36px; flex-shrink: 0; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .un-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .un-lbl { font-size: 12.5px; font-weight: 800; color: #f1f5f9; }
    .un-sub { font-size: 11px; color: #7c8aa0; }
    .howto-list { list-style: none; display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; }
    .howto-list li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: #cbd5e1; }
    .howto-list :global(svg) { color: #c084fc; }
    .inline-link { background: none; border: none; padding: 0; cursor: pointer; font: inherit; font-weight: 800; color: #93c5fd; text-decoration: underline; text-underline-offset: 2px; }

    @media (max-width: 860px) {
        .sum { grid-template-columns: 1fr; }
        .bp-bottom { grid-template-columns: 1fr; }
        .week { grid-template-columns: 1fr; gap: 6px; }
        .week-days { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
        .sc { flex-wrap: wrap; }
        .sc-btn, .sc-done { width: 100%; justify-content: center; }
        .un-list { grid-template-columns: 1fr; }
    }
</style>
