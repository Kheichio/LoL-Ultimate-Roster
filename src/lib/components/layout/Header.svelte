<script>
    import { blueEssence, teamIdentity, skillPoints, dailyLogin, battlePass, collectionRegistry, archiveRewards } from '../../stores/game.js';
    import { activeTab, switchTab, showAuthPanel, splitCooldownEnd } from '../../stores/ui.js';
    import { onDestroy } from 'svelte';
    import { currentUser } from '../../stores/auth.js';
    import { loadFromStorage } from '../../utils/storage.js';

    function isSameDay(d1, d2) {
        if (!d1 || !d2) return false;
        const a = new Date(d1), b = new Date(d2);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    $: dailyAvailable = !isSameDay($dailyLogin.lastClaim, Date.now());
    $: bpCanLevel = ($battlePass.xp || 0) >= 1000;
    $: spAvailable = $skillPoints > 0;

    $: archiveUnclaimed = (() => {
        const reg = $collectionRegistry;
        const claimed = ($archiveRewards && $archiveRewards.claimedCards) || {};
        let count = 0;
        for (const id in reg) {
            if (reg[id] && !claimed[id]) count++;
        }
        return count;
    })();

    $: notifications = {
        rewards: (dailyAvailable ? 1 : 0) + (bpCanLevel ? 1 : 0),
        skills: spAvailable ? $skillPoints : 0,
        collection: archiveUnclaimed > 0 ? archiveUnclaimed : 0,
    };

    const leftTabs = [
        { id: 'home', label: 'Home', accent: true },
        { id: 'store', label: 'Store', accent: true },
        { id: 'club', label: 'Club' },
        { id: 'squad', label: 'Squad', accent: true },
        { id: 'season', label: 'Season' },
    ];

    const rightTabs = [
        { id: 'quests', label: 'Quests' },
        { id: 'upgrade', label: 'Upgrade' },
        { id: 'skills', label: 'Skills' },
        { id: 'collection', label: 'Archive' },
        { id: 'leaderboard', label: 'Board' },
    ];

    const subTabs = [
        { id: 'welcome', label: 'Welcome' },
        { id: 'guide', label: 'Guide' },
        { id: 'rewards', label: 'Rewards' },
        { id: 'trade', label: 'Trade' },
    ];

    let mobileOpen = false;
    function navTo(tab) { switchTab(tab); mobileOpen = false; }

    let splitTimerDisplay = '';
    let splitTimerInterval = null;

    function updateSplitTimer() {
        const end = $splitCooldownEnd;
        if (!end || end <= Date.now()) {
            splitTimerDisplay = '';
            return;
        }
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        splitTimerDisplay = remaining > 0 ? `${remaining}s` : '';
    }

    $: if ($splitCooldownEnd > 0) {
        updateSplitTimer();
        if (!splitTimerInterval) splitTimerInterval = setInterval(updateSplitTimer, 1000);
    } else {
        splitTimerDisplay = '';
        if (splitTimerInterval) { clearInterval(splitTimerInterval); splitTimerInterval = null; }
    }

    function restoreHeaderCooldown() {
        const saved = localStorage.getItem('lur_split_cooldown');
        if (saved) {
            const end = Number(saved);
            if (end > Date.now()) {
                splitCooldownEnd.set(end);
            }
        }
    }
    restoreHeaderCooldown();
    onDestroy(() => { if (splitTimerInterval) clearInterval(splitTimerInterval); });
</script>

<header class="hdr">
    <div class="hdr-inner">
        <!-- LEFT: Team identity — pinned far left -->
        <div class="hdr-left">
            <button class="mob-toggle mobile-only" on:click={() => mobileOpen = !mobileOpen}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/></svg>
            </button>
            <div class="team-chip">
                <span class="team-icon">{$teamIdentity.logo}</span>
                <div class="team-text">
                    <span class="team-n">{$teamIdentity.name}</span>
                    <span class="team-b">💎 {$blueEssence.toLocaleString()}</span>
                </div>
            </div>
            {#if splitTimerDisplay}
                <button class="split-timer" on:click={() => navTo('season')}>
                    <span class="st-icon">⏱</span>
                    <span class="st-time">{splitTimerDisplay}</span>
                </button>
            {/if}
        </div>

        <!-- CENTER: Nav rows — always centered -->
        <div class="hdr-center desktop-only">
            <div class="row-1">
                {#each leftTabs as t}
                    <button class="nt" class:nt-on={$activeTab === t.id} class:nt-accent={t.accent} on:click={() => navTo(t.id)}>{t.label}</button>
                {/each}

                <button class="play" class:play-on={$activeTab === 'tournament'} on:click={() => navTo('tournament')}>
                    P L A Y
                </button>

                {#each rightTabs as t}
                    <button class="nt" class:nt-on={$activeTab === t.id} class:nt-accent={t.accent} on:click={() => navTo(t.id)}>
                        {t.label}
                        {#if notifications[t.id]}<span class="nav-badge">{notifications[t.id]}</span>{/if}
                    </button>
                {/each}
            </div>
            <div class="row-2">
                {#each subTabs as t}
                    <button class="st" class:st-on={$activeTab === t.id} on:click={() => navTo(t.id)}>
                        {t.label}
                        {#if notifications[t.id]}<span class="nav-badge">{notifications[t.id]}</span>{/if}
                    </button>
                {/each}
            </div>
        </div>

        <!-- RIGHT: Account — pinned far right -->
        <div class="hdr-right">
            <button class="acct" on:click={() => showAuthPanel.set(true)}>
                <span class="acct-icon">👤</span>
                <span class="acct-label desktop-only">{$currentUser ? $currentUser.displayName || 'Account' : 'Sign In'}</span>
            </button>
        </div>
    </div>
</header>

<!-- Mobile Drawer -->
{#if mobileOpen}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="mo" on:click={() => mobileOpen = false}>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="md" on:click|stopPropagation>
        <div class="md-head">
            <span class="text-xl">{$teamIdentity.logo}</span>
            <div>
                <div class="md-team">{$teamIdentity.name}</div>
                <div class="md-be">💎 {$blueEssence.toLocaleString()}</div>
            </div>
        </div>
        <div class="md-list">
            {#each [...leftTabs, { id: 'tournament', label: '⚔️ PLAY' }, ...rightTabs, ...subTabs] as t}
                <button class="md-btn" class:md-on={$activeTab === t.id} on:click={() => navTo(t.id)}>{t.label}</button>
            {/each}
        </div>
    </div>
</div>
{/if}

<style>
    .hdr {
        position: sticky; top: 0; z-index: 50;
        background: rgba(6, 9, 17, 0.92);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border-bottom: 1px solid rgba(100, 140, 255, 0.05);
        box-shadow: 0 0 40px rgba(0,0,0,0.3);
    }
    .hdr-inner {
        display: flex; align-items: center;
        max-width: 1800px; margin: 0 auto;
        padding: 0 20px; height: 80px;
    }

    /* LEFT — fixed to far left */
    .hdr-left { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
    .team-chip {
        display: flex; align-items: center; gap: 8px;
        background: linear-gradient(135deg, rgba(30,41,59,0.6), rgba(15,23,42,0.7));
        border: 1px solid rgba(71,85,105,0.25);
        padding: 4px 14px 4px 6px; border-radius: 100px;
    }
    .team-icon { font-size: 24px; }
    .team-text { display: flex; flex-direction: column; line-height: 1.2; }
    .team-n { font-size: 11px; font-weight: 800; color: #8b99ad; }
    .team-b { font-size: 13px; font-weight: 900; color: #60a5fa; }

    /* Split cooldown timer */
    .split-timer {
        display: flex; align-items: center; gap: 4px;
        padding: 4px 10px; border-radius: 8px;
        background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
        cursor: pointer; transition: all 0.12s;
        animation: timerPulse 2s ease-in-out infinite;
    }
    .split-timer:hover { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.4); }
    @keyframes timerPulse {
        0%, 100% { border-color: rgba(239,68,68,0.25); }
        50% { border-color: rgba(239,68,68,0.5); }
    }
    .st-icon { font-size: 11px; }
    .st-time { font-size: 12px; font-weight: 900; color: #f87171; font-family: monospace; }

    /* CENTER — fills remaining space, content centered */
    .hdr-center {
        flex: 1 1 auto;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 1px; min-width: 0;
    }
    .row-1 { display: flex; align-items: center; gap: 2px; }
    .row-2 { display: flex; align-items: center; gap: 2px; margin-top: 3px; }

    /* Nav tabs */
    .nt {
        padding: 7px 16px; border-radius: 8px;
        font-size: 13px; font-weight: 700; color: #4a5568;
        background: transparent; border: 1px solid transparent;
        cursor: pointer; transition: all 0.12s ease; white-space: nowrap;
    }
    .nt:hover { color: #a0aec0; background: rgba(51,65,85,0.25); }
    .nt-on {
        color: #90cdf4 !important;
        background: rgba(59,130,246,0.08) !important;
        border-color: rgba(59,130,246,0.12) !important;
    }
    .nt-accent { color: #7b8fa8; font-weight: 800; }
    .nt-accent:hover { color: #cbd5e1; }
    .nt-accent.nt-on { color: #93c5fd !important; font-weight: 900; }

    /* Notification badge */
    .nav-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 16px; height: 16px; padding: 0 4px;
        border-radius: 100px; font-size: 9px; font-weight: 900;
        background: #ef4444; color: white;
        margin-left: 4px; line-height: 1;
    }

    /* PLAY */
    .play {
        position: relative; margin: 0 10px;
        padding: 8px 28px; border-radius: 100px;
        background: linear-gradient(135deg, #4338ca 0%, #6366f1 40%, #4f46e5 100%);
        background-size: 200% 200%; animation: pg 3s ease infinite;
        border: 2px solid rgba(129,140,248,0.35);
        color: white; font-size: 12px; font-weight: 900; letter-spacing: 5px;
        cursor: pointer; overflow: hidden;
        box-shadow: 0 0 16px rgba(99,102,241,0.25), 0 0 36px rgba(99,102,241,0.06);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .play:hover {
        transform: scale(1.07);
        box-shadow: 0 0 24px rgba(99,102,241,0.45), 0 0 50px rgba(99,102,241,0.12);
    }
    .play-on {
        border-color: rgba(129,140,248,0.6);
        box-shadow: 0 0 22px rgba(99,102,241,0.45), inset 0 0 10px rgba(99,102,241,0.12);
    }
    @keyframes pg { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }

    /* Sub tabs */
    .st {
        padding: 3px 12px; border-radius: 6px;
        font-size: 11px; font-weight: 700; color: #3d4a5c;
        background: transparent; border: none;
        cursor: pointer; transition: all 0.1s ease;
    }
    .st:hover { color: #8b99ad; }
    .st-on { color: #7dd3fc !important; }

    /* RIGHT — fixed to far right */
    .hdr-right { flex: 0 0 auto; margin-left: auto; }
    .acct {
        display: flex; align-items: center; gap: 6px;
        padding: 8px 16px; border-radius: 10px;
        font-size: 12px; font-weight: 700;
        color: #a5b4fc; background: rgba(67,56,202,0.08);
        border: 1px solid rgba(99,102,241,0.12);
        cursor: pointer; transition: all 0.12s ease;
    }
    .acct:hover { background: rgba(67,56,202,0.16); border-color: rgba(99,102,241,0.25); }
    .acct-icon { font-size: 13px; }
    .acct-label { font-size: 11px; }

    /* MOBILE */
    .mob-toggle {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        border-radius: 8px; background: transparent; border: 1px solid rgba(51,65,85,0.25);
        color: #94a3b8; cursor: pointer;
    }
    .mo { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
    .md {
        position: absolute; left: 0; top: 0; bottom: 0; width: 280px;
        background: #0a0e1a; border-right: 1px solid rgba(51,65,85,0.2);
        overflow-y: auto; animation: sI 0.2s ease;
    }
    @keyframes sI { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    .md-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px; border-bottom: 1px solid rgba(51,65,85,0.15); }
    .md-team { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .md-be { font-size: 12px; font-weight: 700; color: #60a5fa; }
    .md-list { padding: 8px; }
    .md-btn {
        display: block; width: 100%; text-align: left;
        padding: 11px 16px; border-radius: 10px;
        font-size: 13px; font-weight: 700; color: #8b99ad;
        background: transparent; border: none; cursor: pointer; transition: all 0.1s ease;
    }
    .md-btn:hover { background: rgba(51,65,85,0.3); color: #e2e8f0; }
    .md-on { background: rgba(59,130,246,0.08) !important; color: #90cdf4 !important; }
</style>
