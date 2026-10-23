<script>
    import { blueEssence, teamIdentity, prestige, skills } from '../../stores/game.js';
    import { activeTab, switchTab, showAuthPanel, splitCooldownEnd } from '../../stores/ui.js';
    import { openMenu } from '../../stores/menu.js';
    import { onDestroy } from 'svelte';
    import { currentUser } from '../../stores/auth.js';
    import { badges } from '../../stores/badges.js';
    import { loadFromStorage } from '../../utils/storage.js';
    import Icon from '../ui/Icon.svelte';

    // Every count comes from stores/badges.js, which the Home page's To-do list reads too.
    // Rewards = today's login + every Battle Pass tier waiting to be claimed (the old badge
    // counted "XP over 1,000", which the pass already auto-levels, so it almost never lit).
    $: notifications = {
        rewards: $badges.rewards,
        skills: $badges.skills,
        collection: $badges.collection,
        quests: $badges.quests,
        upgrade: $badges.upgrade,
        academy: $badges.academy,
        rbc: $badges.rbc,
        friends: $badges.friends,
    };

    // ── The nav ──
    // Grouped the way the game is played: build your club on the left of PLAY, compete and
    // progress on the right, and the pages you visit now and then behind More. Every item
    // carries its own colour so the bar can be read at a glance rather than word by word.
    const LEFT_GROUPS = [
        [{ id: 'home', label: 'Home', icon: 'home', c: '#93c5fd' }],
        [
            { id: 'store',      label: 'Store',   icon: 'store',   c: '#fbbf24' },
            { id: 'club',       label: 'Club',    icon: 'club',    c: '#a5b4fc' },
            { id: 'squad',      label: 'Squad',   icon: 'squad',   c: '#60a5fa' },
            { id: 'academy',    label: 'Academy', icon: 'academy', c: '#34d399' },
            { id: 'upgrade',    label: 'Upgrade', icon: 'upgrade', c: '#c084fc' },
            { id: 'collection', label: 'Archive', icon: 'archive', c: '#fcd34d' },
        ],
    ];
    const RIGHT_GROUPS = [
        [
            { id: 'season',  label: 'Season',  icon: 'calendar', c: '#818cf8' },
            { id: 'rbc',     label: 'RBCs',    icon: 'puzzle',   c: '#fb923c' },
        ],
        [
            { id: 'quests',  label: 'Quests',  icon: 'quests',   c: '#facc15' },
            { id: 'rewards', label: 'Rewards', icon: 'gift',     c: '#f472b6' },
            { id: 'skills',  label: 'Skills',  icon: 'skills',   c: '#fde047' },
        ],
    ];
    // The update log is NOT here: it lives on the main menu, readable without a save.
    const MORE = [
        { id: 'leaderboard', label: 'Ranking', icon: 'ranking', c: '#38bdf8', sub: 'Global leaderboard of managers' },
        { id: 'friends',     label: 'Friends', icon: 'friends', c: '#4ade80', sub: 'Requests, friends and challenges' },
        { id: 'trade',       label: 'Trade',   icon: 'trade',   c: '#2dd4bf', sub: 'The rotating transfer market' },
        { id: 'guide',       label: 'Guide',   icon: 'guide',   c: '#a78bfa', sub: 'How every system works' },
        { id: 'welcome',     label: 'Welcome', icon: 'welcome', c: '#f9a8d4', sub: 'The getting-started page' },
    ];
    const PLAY = { id: 'tournament', label: 'Play', icon: 'play', c: '#a5b4fc' };

    $: moreActive = MORE.some(m => m.id === $activeTab);
    $: moreBadge = MORE.reduce((n, m) => n + (notifications[m.id] || 0), 0);

    // Drawer sections — the same items, grouped and labelled for a narrow screen.
    const DRAWER = [
        { title: 'Your club', items: [LEFT_GROUPS[0][0], ...LEFT_GROUPS[1]] },
        { title: 'Compete', items: [PLAY, ...RIGHT_GROUPS[0]] },
        { title: 'Progress', items: RIGHT_GROUPS[1] },
        { title: 'More', items: MORE },
    ];

    let mobileOpen = false;
    let moreOpen = false;
    function navTo(tab) { switchTab(tab); mobileOpen = false; moreOpen = false; }

    let moreWrap;
    function onWindowClick(e) {
        if (moreOpen && moreWrap && !moreWrap.contains(e.target)) moreOpen = false;
    }
    function onKey(e) {
        if (e.key === 'Escape') { moreOpen = false; mobileOpen = false; }
    }

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
        // Same read as Season.svelte's restoreCooldown, and the same back-compat:
        // the timestamp used to be written raw via String(ms), which is valid JSON,
        // so Number() handles both the old and the new form. Anything unreadable
        // reads as 0 and simply shows no cooldown.
        const end = Number(loadFromStorage('lur_split_cooldown')) || 0;
        if (end > Date.now()) {
            splitCooldownEnd.set(end);
        }
    }
    restoreHeaderCooldown();
    onDestroy(() => { if (splitTimerInterval) clearInterval(splitTimerInterval); });
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<header class="hdr">
    <div class="hdr-inner">
        <!-- LEFT: identity -->
        <div class="hdr-left">
            <button class="mob-toggle" on:click={() => mobileOpen = !mobileOpen} aria-label="Open navigation">
                <Icon name="menu" size={20} />
            </button>
            <button class="team-chip" on:click={() => navTo('home')} title="Home">
                <span class="team-icon">{$teamIdentity.logo}</span>
                <span class="team-text">
                    <span class="team-n">{$teamIdentity.name}</span>
                    <span class="team-b"><Icon name="gem" size={12} stroke={2.2} /> {$blueEssence.toLocaleString()}{#if ($skills.wealth || 0) > 0}<span class="wealth-tag">+{($skills.wealth) * 10}%</span>{/if}</span>
                </span>
            </button>
            {#if splitTimerDisplay}
                <button class="split-timer" on:click={() => navTo('season')} title="Season split cooldown">
                    <Icon name="clock" size={13} />
                    <span class="st-time">{splitTimerDisplay}</span>
                </button>
            {/if}
        </div>

        <!-- CENTRE: the nav -->
        <nav class="nav" aria-label="Main">
            {#each LEFT_GROUPS as group, gi}
                {#if gi > 0}<span class="nav-sep" aria-hidden="true"></span>{/if}
                {#each group as t (t.id)}
                    <button class="ni" class:ni-on={$activeTab === t.id} style="--c: {t.c};" on:click={() => navTo(t.id)} aria-current={$activeTab === t.id ? 'page' : undefined}>
                        <span class="ni-ico"><Icon name={t.icon} size={19} />{#if notifications[t.id]}<span class="ni-badge">{notifications[t.id] > 99 ? '99+' : notifications[t.id]}</span>{/if}</span>
                        <span class="ni-label">{t.label}</span>
                    </button>
                {/each}
            {/each}

            <button class="play" class:play-on={$activeTab === 'tournament'} on:click={() => navTo('tournament')}>
                <span class="play-ico"><Icon name="play" size={15} stroke={2.4} /></span>
                <span class="play-label">PLAY</span>
            </button>

            {#each RIGHT_GROUPS as group, gi}
                {#if gi > 0}<span class="nav-sep" aria-hidden="true"></span>{/if}
                {#each group as t (t.id)}
                    <button class="ni" class:ni-on={$activeTab === t.id} style="--c: {t.c};" on:click={() => navTo(t.id)} aria-current={$activeTab === t.id ? 'page' : undefined}>
                        <span class="ni-ico"><Icon name={t.icon} size={19} />{#if notifications[t.id]}<span class="ni-badge">{notifications[t.id] > 99 ? '99+' : notifications[t.id]}</span>{/if}</span>
                        <span class="ni-label">{t.label}</span>
                    </button>
                {/each}
            {/each}

            <span class="nav-sep" aria-hidden="true"></span>
            <div class="more-wrap" bind:this={moreWrap}>
                <button class="ni" class:ni-on={moreActive || moreOpen} style="--c: #cbd5e1;" on:click={() => moreOpen = !moreOpen} aria-expanded={moreOpen} aria-haspopup="true">
                    <span class="ni-ico"><Icon name="menu" size={19} />{#if moreBadge}<span class="ni-badge">{moreBadge}</span>{/if}</span>
                    <span class="ni-label">More</span>
                </button>
                {#if moreOpen}
                    <div class="more-pop" role="menu">
                        {#each MORE as m (m.id)}
                            <button class="mp-item" class:mp-on={$activeTab === m.id} style="--c: {m.c};" role="menuitem" on:click={() => navTo(m.id)}>
                                <span class="mp-ico"><Icon name={m.icon} size={18} /></span>
                                <span class="mp-text">
                                    <span class="mp-label">{m.label}{#if notifications[m.id]}<span class="ni-badge mp-badge">{notifications[m.id]}</span>{/if}</span>
                                    <span class="mp-sub">{m.sub}</span>
                                </span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </nav>

        <!-- RIGHT: account -->
        <div class="hdr-right">
            {#if $prestige > 0}
                <div class="prestige-chip" title="Prestige {$prestige}"><Icon name="star" size={12} stroke={2.2} /> P{$prestige}</div>
            {/if}
            <button class="icon-btn menu-btn" title="Back to Main Menu" aria-label="Back to Main Menu" on:click={() => { mobileOpen = false; openMenu(); }}>
                <Icon name="home" size={17} />
                <span class="btn-label">Menu</span>
            </button>
            <button class="icon-btn acct" title="Account & settings" on:click={() => showAuthPanel.set(true)}>
                <Icon name="user" size={17} />
                <span class="btn-label">{$currentUser ? $currentUser.displayName || 'Account' : 'Sign In'}</span>
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
            <span class="md-logo">{$teamIdentity.logo}</span>
            <div>
                <div class="md-team">{$teamIdentity.name}</div>
                <div class="md-be"><Icon name="gem" size={12} /> {$blueEssence.toLocaleString()}</div>
            </div>
        </div>
        {#each DRAWER as sec}
            <div class="md-sec">{sec.title}</div>
            <div class="md-list">
                {#each sec.items as t (t.id)}
                    <button class="md-btn" class:md-on={$activeTab === t.id} class:md-play={t.id === 'tournament'} style="--c: {t.c};" on:click={() => navTo(t.id)}>
                        <span class="md-ico"><Icon name={t.icon} size={18} /></span>
                        <span class="md-label">{t.label}</span>
                        {#if notifications[t.id]}<span class="ni-badge md-badge">{notifications[t.id]}</span>{/if}
                    </button>
                {/each}
            </div>
        {/each}
    </div>
</div>
{/if}

<style>
    .hdr {
        position: sticky; top: 0; z-index: 50;
        background: rgba(7, 10, 20, 0.94);
        backdrop-filter: blur(22px) saturate(170%);
        -webkit-backdrop-filter: blur(22px) saturate(170%);
        border-bottom: 1px solid rgba(129, 140, 248, 0.12);
        box-shadow: 0 8px 30px rgba(0,0,0,0.35);
    }
    .hdr-inner {
        display: flex; align-items: center; gap: 14px;
        max-width: 1800px; margin: 0 auto;
        padding: 0 18px; height: 70px;
    }

    /* LEFT */
    .hdr-left { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
    .team-chip {
        display: flex; align-items: center; gap: 9px; cursor: pointer; text-align: left;
        background: linear-gradient(135deg, rgba(30,41,59,0.75), rgba(15,23,42,0.85));
        border: 1px solid rgba(100,116,139,0.3);
        padding: 5px 14px 5px 6px; border-radius: 100px;
    }
    .team-chip:hover { border-color: rgba(147,197,253,0.45); }
    .team-icon { font-size: 26px; line-height: 1; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(2,6,23,0.6); }
    .team-text { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
    .team-n { font-size: 12px; font-weight: 800; color: #cbd5e1; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .team-b { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 900; color: #7dd3fc; }
    .wealth-tag { margin-left: 2px; font-size: 9px; font-weight: 900; color: #38bdf8; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3); border-radius: 6px; padding: 1px 5px; }

    .split-timer {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 10px; border-radius: 10px; color: #fca5a5;
        background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
        cursor: pointer; animation: timerPulse 2s ease-in-out infinite;
    }
    .split-timer:hover { background: rgba(239,68,68,0.2); }
    @keyframes timerPulse { 0%, 100% { border-color: rgba(239,68,68,0.3); } 50% { border-color: rgba(239,68,68,0.6); } }
    .st-time { font-size: 12px; font-weight: 900; font-family: monospace; }

    /* CENTRE */
    .nav { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 2px; }
    .nav-sep { width: 1px; height: 30px; margin: 0 6px; background: linear-gradient(transparent, rgba(148,163,184,0.28), transparent); flex-shrink: 0; }

    .ni {
        position: relative; flex-shrink: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        min-width: 60px; padding: 7px 8px 6px; border-radius: 12px;
        background: transparent; border: 1px solid transparent; cursor: pointer;
        color: #a8b3c7;
    }
    .ni-ico { position: relative; display: flex; color: color-mix(in srgb, var(--c) 62%, #8391a7); transition: color 0.15s, transform 0.15s; }
    .ni-label { font-size: 11px; font-weight: 800; letter-spacing: 0.2px; white-space: nowrap; }
    .ni:hover { color: #f1f5f9; background: rgba(51,65,85,0.32); }
    .ni:hover .ni-ico { color: var(--c); transform: translateY(-1px); }
    .ni::after {
        content: ''; position: absolute; left: 22%; right: 22%; bottom: -1px; height: 2px; border-radius: 2px;
        background: var(--c); opacity: 0; transform: scaleX(0.4); transition: opacity 0.15s, transform 0.15s;
    }
    .ni-on { color: #fff; background: color-mix(in srgb, var(--c) 13%, transparent); border-color: color-mix(in srgb, var(--c) 22%, transparent); }
    .ni-on .ni-ico { color: var(--c); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--c) 55%, transparent)); }
    .ni-on::after { opacity: 1; transform: scaleX(1); }

    .ni-badge {
        position: absolute; top: -7px; right: -12px;
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 17px; height: 17px; padding: 0 5px;
        border-radius: 100px; font-size: 9.5px; font-weight: 900; line-height: 1;
        background: #ef4444; color: #fff; border: 2px solid #0b0f1c;
        box-shadow: 0 2px 6px rgba(239,68,68,0.45);
    }

    /* PLAY */
    .play {
        position: relative; flex-shrink: 0; margin: 0 12px;
        display: flex; align-items: center; gap: 9px;
        padding: 11px 26px 11px 14px; border-radius: 100px; cursor: pointer;
        background: linear-gradient(135deg, #4338ca 0%, #6366f1 45%, #4f46e5 100%);
        background-size: 200% 200%; animation: pg 4s ease infinite;
        border: 1px solid rgba(165,180,252,0.5);
        color: #fff; box-shadow: 0 0 18px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.25);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .play-ico { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.18); padding-left: 2px; }
    .play-label { font-size: 14px; font-weight: 900; letter-spacing: 4px; }
    .play:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 0 30px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.3); }
    .play-on { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(129,140,248,0.25), 0 0 26px rgba(99,102,241,0.55); }
    @keyframes pg { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }

    /* More */
    .more-wrap { position: relative; }
    .more-pop {
        position: absolute; top: calc(100% + 10px); right: 0; z-index: 60;
        width: 270px; padding: 6px; border-radius: 16px;
        background: #0c1222; border: 1px solid rgba(100,116,139,0.3);
        box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        animation: popIn 0.14s ease-out;
    }
    @keyframes popIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
    .mp-item { width: 100%; display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 11px; background: transparent; border: none; cursor: pointer; text-align: left; }
    .mp-item:hover, .mp-on { background: rgba(51,65,85,0.35); }
    .mp-ico { width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); }
    .mp-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .mp-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .mp-sub { font-size: 11px; color: #7c8aa0; }
    .mp-badge { position: static; border: none; }

    /* RIGHT */
    .hdr-right { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
    .prestige-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 900; color: #fbbf24; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.28); border-radius: 10px; padding: 6px 10px; white-space: nowrap; }
    .icon-btn {
        display: flex; align-items: center; gap: 7px;
        padding: 9px 14px; border-radius: 12px; cursor: pointer;
        font-size: 12px; font-weight: 800;
    }
    .acct { color: #c7d2fe; background: rgba(67,56,202,0.14); border: 1px solid rgba(129,140,248,0.28); }
    .acct:hover { background: rgba(67,56,202,0.26); border-color: rgba(165,180,252,0.5); }
    .menu-btn { color: #f5cd7d; background: rgba(245,185,66,0.08); border: 1px solid rgba(245,185,66,0.22); }
    .menu-btn:hover { background: rgba(245,185,66,0.16); border-color: rgba(245,185,66,0.4); }
    .btn-label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* The bar is ~1,100px of buttons at full size. Tighten in steps rather than overflow. */
    @media (max-width: 1500px) {
        .ni { min-width: 54px; padding: 7px 6px 6px; }
        .menu-btn .btn-label, .prestige-chip { display: none; }
        .menu-btn { padding: 9px 11px; }
    }
    @media (max-width: 1360px) {
        .team-n { display: none; }
        .team-chip { padding-right: 12px; }
        .acct .btn-label { display: none; }
        .acct { padding: 9px 11px; }
        .ni { min-width: 50px; padding: 7px 4px 6px; }
        .ni-label { font-size: 10.5px; }
        .play { margin: 0 8px; padding: 10px 20px 10px 12px; }
        .play-label { letter-spacing: 3px; }
        .nav-sep { margin: 0 3px; }
    }
    /* Below this the bar physically cannot fit — hand navigation to the drawer, which lists
       every page grouped the same way. */
    @media (max-width: 1140px) {
        .nav { display: none; }
        .mob-toggle { display: flex !important; }
        .hdr-right { margin-left: auto; }
        .team-n { display: block; }
    }

    /* MOBILE */
    .mob-toggle {
        display: none; width: 40px; height: 40px; align-items: center; justify-content: center;
        border-radius: 12px; background: rgba(30,41,59,0.6); border: 1px solid rgba(100,116,139,0.3);
        color: #cbd5e1; cursor: pointer;
    }
    .mo { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
    .md {
        position: absolute; left: 0; top: 0; bottom: 0; width: 290px;
        background: #0a0f1c; border-right: 1px solid rgba(100,116,139,0.25);
        overflow-y: auto; animation: sI 0.2s ease; padding-bottom: 20px;
    }
    @keyframes sI { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    .md-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid rgba(51,65,85,0.3); }
    .md-logo { font-size: 30px; }
    .md-team { font-size: 15px; font-weight: 900; color: #f1f5f9; }
    .md-be { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; color: #7dd3fc; }
    .md-sec { padding: 16px 22px 6px; font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
    .md-list { padding: 0 10px; display: flex; flex-direction: column; gap: 2px; }
    .md-btn {
        display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
        padding: 10px 12px; border-radius: 12px;
        font-size: 14px; font-weight: 800; color: #cbd5e1;
        background: transparent; border: none; cursor: pointer;
    }
    .md-ico { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
    .md-label { flex: 1; }
    .md-badge { position: static; border: none; }
    .md-btn:hover { background: rgba(51,65,85,0.35); color: #fff; }
    .md-on { background: color-mix(in srgb, var(--c) 14%, transparent); color: #fff; }
    .md-play .md-ico { color: #fff; background: linear-gradient(135deg, #4f46e5, #6366f1); }
</style>
