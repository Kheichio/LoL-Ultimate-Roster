<script>
    import { onDestroy } from 'svelte';
    import {
        menuScreen, selectedMode, GAMEMODES, MORE_GAMES, STUDIO, GAME_STATUS, openMenu, openStudio,
        setBootIntent, takeBootIntent, currentSlot,
        openUpdates, closeUpdates, updatesReturn,
    } from '../../stores/menu.js';
    import UpdateLog from './UpdateLog.svelte';
    import Card from '../card/Card.svelte';
    import { UPDATES } from '../../utils/updates.js';
    import { openSettings, openConfirmModal } from '../../stores/ui.js';
    import Icon from '../ui/Icon.svelte';
    import { currentUser } from '../../stores/auth.js';
    import { playSound } from '../../utils/sound.js';
    import { getCardById, getDB } from '../../utils/cards.js';
    import {
        SLOT_IDS, setActiveSlot, activeSlot, clearSlot,
    } from '../../utils/storage.js';
    import { careerSlotSummary } from '../../stores/career.js';
    import { rosterSlotSummary, flushGame } from '../../stores/game.js';
    import { ROLE_BY_ID, REGION_BY_ID, CHAMPIONS, allTeams } from '../../career/constants.js';
    import { ovrTier } from '../../career/ratings.js';

    const REDUCED = typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const VERSION = UPDATES[0]?.ver || '';

    const TIPS = [
        'Chemistry beats raw rating — one region, one era and two same-team pairs hit the cap.',
        'Signature cards add +2 to every stat. Holographics add +1. They stack.',
        'Only three Hall of Legends cards exist in the whole game: Faker, Uzi and Caps.',
        'Coaches never enter the fight — their rating buffs the entire starting five.',
        'The Gaming Cafe is free to enter. Win there first, then buy better packs.',
        'Ten Bronze cards of the same role upgrade into a Silver. Keep your duplicates.',
        'Clubs on the Transfer Market pay several times Quick Sell for the right spare card.',
        'Reach the Spring or Summer final to qualify for MSI or Worlds.',
        'The Academy farms Blue Essence in the background while you play.',
        'Every card you ever own is logged in the Archive, even after you sell it.',
    ];

    // Feature lines on each mode card. Every number is read from the game, never typed in.
    const db = getDB();
    const CARD_COUNT = db ? db.length : 0;
    const FEATURES = {
        roster: [
            CARD_COUNT ? `${CARD_COUNT.toLocaleString()} real pro cards, 2011 to today` : 'Real pro cards, 2011 to today',
            'Three splits a year: qualify for First Stand, MSI and Worlds',
            'Packs, Upgrade Lab, Transfer Market and the Archive',
        ],
        career: [
            'Create a pro: role, region, playstyle and signature champion',
            `${CHAMPIONS.length} champions and ${allTeams().length} clubs across six regions`,
            'Train, sign contracts, win titles, retire a legend',
        ],
    };
    // The Hall of Legends — every inductee, Faker in the middle. Missing ones (no DB) are skipped.
    const SHOWCASE = [13001, 13000, 13002].map(id => getCardById(id)).filter(c => c && typeof c.name === 'string');
    const noop = () => {};

    let loadingMode = null;
    let progress = 0;
    let tipIndex = 0;
    let raf = null;
    let tipTimer = null;
    let handoff = null;

    // A roster slot switch reloads the page (see chooseSlot). Without this the
    // player would be dropped back at the title screen every time, which reads
    // as the click not having worked.
    const bootIntent = typeof window !== 'undefined' ? takeBootIntent() : null;
    if (bootIntent) {
        const mode = GAMEMODES.find(m => m.id === bootIntent);
        if (mode && mode.available) {
            selectedMode.set(mode.id);
            menuScreen.set(mode.id === 'career' ? 'career' : 'game');
        }
    }

    function cleanup() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
        if (handoff) { clearTimeout(handoff); handoff = null; }
    }
    onDestroy(cleanup);

    // Fast to ~55%, a short hold, then an ease into 100% — reads like a real load
    // rather than a linear bar.
    function easeLoad(t) {
        if (t < 0.35) return (t / 0.35) * 0.55;
        if (t < 0.50) return 0.55 + ((t - 0.35) / 0.15) * 0.07;
        const u = (t - 0.5) / 0.5;
        return 0.62 + (1 - (1 - u) * (1 - u)) * 0.38;
    }

    // ═══════════════ SAVE SLOTS ═══════════════
    //  Three per gamemode, entirely independent. Slot 1 is the bare key, so the
    //  save that existed before slots shipped is already sitting in it — nothing
    //  was migrated and nothing could be lost migrating it.
    let slotMode = null;      // the GAMEMODES entry whose slots are showing
    let slotRefresh = 0;      // bumped to re-read the previews after a delete

    const summaryFor = (modeId, n) => (modeId === 'career' ? careerSlotSummary(n) : rosterSlotSummary(n));

    $: slotCards = (slotMode && slotRefresh >= 0)
        ? SLOT_IDS.map(n => ({
            n,
            active: n === currentSlot(slotMode.id),
            career: slotMode.id === 'career' ? careerSlotSummary(n) : null,
            roster: slotMode.id === 'roster' ? rosterSlotSummary(n) : null,
        }))
        : [];
    $: usedSlots = slotCards.filter(s => s.career || s.roster).length;

    // The save each mode card offers to continue: whichever slot that mode is pointed at.
    $: modeSaves = ($menuScreen, slotRefresh, Object.fromEntries(GAMEMODES.map(m => {
        const n = currentSlot(m.id);
        return [m.id, { n, summary: m.available ? summaryFor(m.id, n) : null }];
    })));

    function openSlots(mode) {
        cleanup();
        slotMode = mode;
        selectedMode.set(mode.id);
        slotRefresh++;
        menuScreen.set('slots');
        playSound('click');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    function backToMenu() {
        cleanup();
        slotMode = null;
        openMenu();
        playSound('click');
    }

    /** Straight into the slot the mode is already pointed at — no detour through the picker. */
    function continueMode(mode) {
        if (!mode.available) { pickMode(mode); return; }
        slotMode = mode;
        chooseSlot(currentSlot(mode.id));
    }

    function chooseSlot(n) {
        if (!slotMode) return;
        const family = slotMode.id === 'career' ? 'career' : 'roster';

        // Drain any debounced write BEFORE the active slot moves, or the save in
        // flight lands under the slot the player is switching TO.
        //
        // ONLY for a mode that is actually loaded. The career store is blank
        // until CareerShell mounts, so flushing it from the menu wrote an empty
        // career over the player's save and then loaded the blank back. The
        // roster stores ARE hydrated here, because App.svelte calls initGame()
        // at boot, so that one is both safe and necessary.
        if (family === 'roster') flushGame();

        const changed = setActiveSlot(family, n);

        // Ultimate Career remounts its whole shell on entry and re-hydrates from
        // storage, so switching slot in place is safe. Ultimate Roster does not:
        // initGame() runs once at boot and MERGES rather than resets, and the
        // roster shell is deliberately never torn down. Reloading is the honest
        // fix; the boot intent is what stops the reload dumping the player back
        // at the title screen.
        if (family === 'roster' && changed) {
            setBootIntent('roster');
            location.reload();
            return;
        }
        pickMode(slotMode);
    }

    function wipeSlot(n) {
        if (!slotMode) return;
        const family = slotMode.id === 'career' ? 'career' : 'roster';
        playSound('click');
        openConfirmModal(
            `Delete ${slotMode.name} slot ${n}? Everything in it goes, and it does not come back.`,
            () => {
                // Same reason as chooseSlot: never flush a store that has not
                // been loaded. The slot is about to be erased either way.
                if (family === 'roster') flushGame();
                clearSlot(family, n);
                // Wiping the slot you are standing in leaves the in-memory stores
                // holding a save that no longer exists on disk. A reload is the
                // only honest way back to an empty slot.
                if (n === activeSlot(family)) {
                    setBootIntent('');
                    location.reload();
                    return;
                }
                slotRefresh++;
            },
        );
    }

    function slotRoleLine(s) {
        const role = ROLE_BY_ID[s.role];
        const region = REGION_BY_ID[s.region];
        return `${role ? role.short : s.role} · ${region ? region.league : s.region}`;
    }

    function pickMode(mode) {
        cleanup();
        loadingMode = mode;
        selectedMode.set(mode.id);
        progress = 0;
        tipIndex = Math.floor(Math.random() * TIPS.length);
        menuScreen.set('loading');
        playSound('claim');

        const DURATION = REDUCED ? 350 : 2200;
        const start = performance.now();
        if (!REDUCED) tipTimer = setInterval(() => { tipIndex = (tipIndex + 1) % TIPS.length; }, 1500);

        const step = (now) => {
            const t = Math.min(1, (now - start) / DURATION);
            progress = Math.round(easeLoad(t) * 100);
            if (t < 1) { raf = requestAnimationFrame(step); return; }
            finish();
        };
        raf = requestAnimationFrame(step);
    }

    // Each gamemode hands off to its own shell: 'game' is the Ultimate Roster
    // Header/TabContent shell, 'career' is CareerShell. Anything still marked
    // unavailable falls back to the menu rather than dead-ending on a blank screen.
    function finish() {
        cleanup();
        progress = 100;
        handoff = setTimeout(() => {
            handoff = null;
            if (!loadingMode || !loadingMode.available) { openMenu(); return; }
            playSound('win');
            menuScreen.set(loadingMode.id === 'career' ? 'career' : 'game');
        }, REDUCED ? 0 : 300);
    }

    function onKey(e) {
        if (e.key !== 'Escape') return;
        if (document.querySelector('[aria-modal="true"]')) return;   // a dialog owns Escape
        if ($menuScreen === 'slots' || $menuScreen === 'studio') backToMenu();
    }

    // Studio page numbers — read from the game, not typed in.
    const STUDIO_STATS = [
        { n: CARD_COUNT ? CARD_COUNT.toLocaleString() : '—', l: 'pro cards' },
        { n: String(CHAMPIONS.length), l: 'career champions' },
        { n: String(allTeams().length), l: 'career clubs' },
        { n: String(UPDATES.length), l: 'releases so far' },
    ];
</script>

<svelte:window on:keydown={onKey} />

<section class="menu">
    <div class="menu-wash" aria-hidden="true"></div>

    {#if $menuScreen === 'menu'}
        <!-- ══════════════ MAIN MENU ══════════════ -->
        <div class="topbar">
            <button class="studio-link" on:click={() => { playSound('click'); openStudio(); }}>
                <span class="s8" aria-hidden="true">S8</span>
                <span class="studio-name">Studio8Heads</span>
            </button>
            <div class="tb-right">
                <button class="pill" on:click={() => { playSound('click'); openUpdates('menu'); }}>
                    <Icon name="quests" size={14} stroke={2.1} />
                    <span class="pill-hide">What's new</span>
                    <span class="pill-ver">{VERSION}</span>
                </button>
                <button class="pill" on:click={() => { playSound('click'); openSettings('display'); }} aria-label="Settings">
                    <Icon name="settings" size={15} stroke={2.1} />
                    <span class="pill-hide">Settings</span>
                </button>
                {#if $currentUser}
                    <button class="pill pill-in" on:click={() => openSettings('account')}>
                        <span class="pill-dot"></span>
                        <span class="pill-name">{$currentUser.displayName || 'Signed in'}</span>
                    </button>
                {:else}
                    <button class="pill pill-login" on:click={() => { playSound('click'); openSettings('account'); }}>
                        <Icon name="user" size={14} stroke={2.1} />
                        Log in
                    </button>
                {/if}
            </div>
        </div>

        <div class="stage stage-menu">
            <!-- ── Title ── -->
            <div class="title-row">
                <div class="title-block">
                    <!-- "UR" monogram in the wordmark's grotesque, with a five-segment rule under
                         it — one segment per role, the MID one accented. -->
                    <svg class="mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="LoL Ultimate Roster">
                        <rect x="1.75" y="1.75" width="68.5" height="68.5" rx="20" stroke="#2c3f5c" stroke-width="2.5" />
                        <text class="mark-mono" x="36" y="43.5" text-anchor="middle" font-size="29" font-weight="700" letter-spacing="-1.4">UR</text>
                        <g>
                            <rect x="19"   y="53" width="5.5" height="2.6" rx="1.3" fill="#39527a" />
                            <rect x="26.2" y="53" width="5.5" height="2.6" rx="1.3" fill="#456b9c" />
                            <rect x="33.4" y="53" width="5.5" height="2.6" rx="1.3" fill="#60a5fa" />
                            <rect x="40.6" y="53" width="5.5" height="2.6" rx="1.3" fill="#456b9c" />
                            <rect x="47.8" y="53" width="5.5" height="2.6" rx="1.3" fill="#39527a" />
                        </g>
                    </svg>
                    <p class="eyebrow">League of Legends</p>
                    <h1 class="wordmark">Ultimate<span class="wm-thin">Roster</span></h1>
                    <p class="tagline">Collect the players. Build the five. Win the world.</p>
                </div>
                {#if SHOWCASE.length}
                    <div class="fan" aria-hidden="true">
                        {#each SHOWCASE as card, i (card.id)}
                            <div class="fan-card" style="--i: {i - (SHOWCASE.length - 1) / 2};"><Card {card} mini onclick={noop} /></div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- ── Gamemodes ── -->
            <div class="modes">
                {#each GAMEMODES as mode (mode.id)}
                    {@const save = modeSaves[mode.id]}
                    {@const s = save && save.summary}
                    <div class="mode" class:mode-soon={!mode.available} style="--accent: {mode.accent};">
                        <div class="mode-head">
                            <span class="mode-ico" aria-hidden="true">
                                {#if mode.id === 'roster'}
                                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
                                        <rect x="4" y="9" width="10" height="15" rx="2" transform="rotate(-9 9 16.5)" />
                                        <rect x="18" y="9" width="10" height="15" rx="2" transform="rotate(9 23 16.5)" />
                                        <rect x="11" y="7" width="10" height="18" rx="2" fill="#0b1120" />
                                        <path d="M16 12.5v7M12.5 16h7" stroke-linecap="round" />
                                    </svg>
                                {:else}
                                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                                        <circle cx="16" cy="11" r="4.4" />
                                        <path d="M7.5 25.5v-1.2c0-3.4 3.8-5.6 8.5-5.6s8.5 2.2 8.5 5.6v1.2" />
                                        <path d="M24.5 9.5 27 7m0 0h-3.2M27 7v3.2" stroke-linejoin="round" />
                                    </svg>
                                {/if}
                            </span>
                            <div class="mode-titles">
                                <span class="mode-name">{mode.name}</span>
                                <span class="mode-tag">{mode.tagline}</span>
                            </div>
                            {#if !mode.available}<span class="chip">Soon</span>{/if}
                        </div>
                        <p class="mode-desc">{mode.desc}</p>
                        <ul class="mode-feats">
                            {#each FEATURES[mode.id] || [] as f}<li><Icon name="check" size={12} stroke={2.6} />{f}</li>{/each}
                        </ul>

                        <div class="mode-save">
                            {#if s && mode.id === 'roster'}
                                <span class="ms-logo">{s.logo}</span>
                                <span class="ms-text">
                                    <span class="ms-name">{s.name}</span>
                                    <span class="ms-meta">Slot {save.n} · Lv {s.level} · {s.season}</span>
                                </span>
                            {:else if s && mode.id === 'career'}
                                <span class="ms-ovr" style="--k: {ovrTier(s.ovr).color};">{s.ovr}</span>
                                <span class="ms-text">
                                    <span class="ms-name">{s.handle}</span>
                                    <span class="ms-meta">Slot {save.n} · {s.retired ? 'Retired' : s.team} · {s.year}</span>
                                </span>
                            {:else}
                                <span class="ms-empty"><Icon name="sparkle" size={14} stroke={2.2} /></span>
                                <span class="ms-text">
                                    <span class="ms-name">{mode.id === 'career' ? 'No player yet' : 'No club yet'}</span>
                                    <span class="ms-meta">Slot {save ? save.n : 1} is empty — start fresh here</span>
                                </span>
                            {/if}
                        </div>

                        <div class="mode-btns">
                            <button class="mode-play" on:click={() => continueMode(mode)}>
                                <Icon name="play" size={14} stroke={2.2} />
                                {s ? 'Continue' : mode.id === 'career' ? 'Create a player' : 'Start a club'}
                            </button>
                            {#if mode.available}
                                <button class="mode-slots" on:click={() => openSlots(mode)}>
                                    <Icon name="archive" size={14} stroke={2.1} /> Save slots
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- ── More ── -->
            <div class="tiles">
                <button class="tile" style="--c: #06b6d4;" on:click={() => { playSound('click'); openUpdates('menu'); }}>
                    <span class="tile-ico"><Icon name="quests" size={18} /></span>
                    <span class="tile-text">
                        <span class="tile-name">Update Log <span class="tile-ver">{VERSION}</span></span>
                        <span class="tile-sub">{UPDATES[0]?.title || 'Every patch, in full'}</span>
                    </span>
                    <Icon name="chevron" size={14} stroke={2.2} />
                </button>
                <button class="tile" style="--c: #a78bfa;" on:click={() => { playSound('click'); openStudio(); }}>
                    <span class="tile-ico tile-s8">S8</span>
                    <span class="tile-text">
                        <span class="tile-name">About Studio8Heads</span>
                        <span class="tile-sub">Who makes this game, and what else we make</span>
                    </span>
                    <Icon name="chevron" size={14} stroke={2.2} />
                </button>
                {#each MORE_GAMES as g (g.id)}
                    <a class="tile" style="--c: {g.color};" href={g.href} target="_blank" rel="noopener noreferrer">
                        <span class="tile-ico"><Icon name={g.icon} size={18} /></span>
                        <span class="tile-text">
                            <span class="tile-name">{g.name}</span>
                            <span class="tile-sub">{g.blurb}</span>
                        </span>
                        <Icon name="arrow" size={14} stroke={2.2} />
                    </a>
                {/each}
            </div>

            <p class="foot-note">
                {#if $currentUser}
                    Signed in as <strong>{$currentUser.displayName || 'manager'}</strong> — your club backs up to the cloud.
                {:else}
                    Playing as a guest. <button class="linkish" on:click={() => openSettings('account')}>Log in</button> to back up your club and join the leaderboard.
                {/if}
            </p>
            <p class="build">{VERSION} Public Build</p>
        </div>

    {:else if $menuScreen === 'slots' && slotMode}
        <!-- ══════════════ SAVE SLOTS ══════════════ -->
        <div class="stage stage-slots" style="--accent: {slotMode.accent};">
            <div class="sub-topbar">
                <button class="back" on:click={backToMenu}><Icon name="chevron" size={14} stroke={2.4} /> Main menu</button>
            </div>
            <p class="eyebrow eyebrow-accent">{slotMode.name}</p>
            <h2 class="page-h">Choose a save</h2>
            <p class="page-sub">Three slots, kept completely apart — {usedSlots} of 3 in use. Nothing you do in one ever reaches another.</p>

            <div class="slots">
                {#each slotCards as s (s.n)}
                    {@const used = !!(s.career || s.roster)}
                    <div class="slot" class:slot-empty={!used} class:slot-active={s.active}>
                        <div class="slot-band">
                            <span class="slot-n">Slot {s.n}</span>
                            {#if s.active}<span class="slot-badge">Last played</span>{/if}
                        </div>

                        <div class="slot-body">
                            {#if s.career}
                                <div class="slot-id">
                                    <span class="slot-ovr" style="--k: {ovrTier(s.career.ovr).color};">{s.career.ovr}<i>OVR</i></span>
                                    <span class="slot-names">
                                        <span class="slot-name">{s.career.handle}</span>
                                        <span class="slot-meta">{slotRoleLine(s.career)}</span>
                                    </span>
                                </div>
                                <div class="slot-stats">
                                    <span><b>{s.career.age}</b>age</span>
                                    <span><b>{s.career.trophies}</b>trophies</span>
                                    <span><b>{s.career.year}</b>season</span>
                                </div>
                                <span class="slot-foot">{s.career.retired ? 'Retired' : s.career.team} · week {s.career.week}</span>
                            {:else if s.roster}
                                <div class="slot-id">
                                    <span class="slot-logo" style="--k: {s.roster.color};">{s.roster.logo}</span>
                                    <span class="slot-names">
                                        <span class="slot-name">{s.roster.name}</span>
                                        <span class="slot-meta">Level {s.roster.level}{s.roster.prestige ? ` · Prestige ${s.roster.prestige}` : ''}</span>
                                    </span>
                                </div>
                                <div class="slot-stats">
                                    <span><b>{s.roster.clubSize.toLocaleString()}</b>cards</span>
                                    <span><b>{s.roster.titles}</b>trophies</span>
                                    <span><b>{s.roster.be >= 100000 ? Math.floor(s.roster.be / 1000) + 'K' : s.roster.be.toLocaleString()}</b>BE</span>
                                </div>
                                <span class="slot-foot">{s.roster.season}{s.roster.seasonLive ? ' · in progress' : ''}</span>
                            {:else}
                                <div class="slot-new">
                                    <span class="slot-plus"><Icon name="sparkle" size={22} stroke={2} /></span>
                                    <span class="slot-name slot-name-empty">Empty slot</span>
                                    <span class="slot-meta">{slotMode.id === 'career' ? 'Create a new player here' : 'Start a new club here'}</span>
                                </div>
                            {/if}
                        </div>

                        <div class="slot-actions">
                            <button class="slot-go" on:click={() => chooseSlot(s.n)}>
                                {used ? (s.active ? 'Continue' : 'Load this save') : (slotMode.id === 'career' ? 'Create player' : 'Start club')}
                            </button>
                            {#if used}
                                <button class="slot-del" on:click={() => wipeSlot(s.n)} aria-label="Delete slot {s.n}" title="Delete this save">
                                    <Icon name="close" size={14} stroke={2.2} />
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>

            <div class="slot-note">
                <Icon name="shield" size={15} />
                <span>
                    {#if slotMode.id === 'career'}
                        Career saves live on this device. Sign in and every career slot is backed up to the cloud with your account.
                    {:else}
                        Cloud backup follows whichever slot is loaded. Sign in on another device and it restores into the slot you have open there.
                    {/if}
                    Switching slot never touches the others; deleting one asks first.
                </span>
            </div>
        </div>

    {:else if $menuScreen === 'studio'}
        <!-- ══════════════ STUDIO8HEADS ══════════════ -->
        <div class="stage stage-studio">
            <div class="sub-topbar">
                <button class="back" on:click={backToMenu}><Icon name="chevron" size={14} stroke={2.4} /> Main menu</button>
            </div>

            <div class="st-hero">
                <span class="st-mark" aria-hidden="true">S8</span>
                <p class="eyebrow">About us</p>
                <h2 class="page-h">{STUDIO.name}</h2>
                <p class="st-tag">{STUDIO.tagline}</p>
                <p class="st-intro">{STUDIO.intro}</p>
                {#if STUDIO.discord}
                    <a class="st-discord" href={STUDIO.discord} target="_blank" rel="noopener noreferrer">
                        <Icon name="friends" size={16} stroke={2.1} /> Join the Studio8Heads Discord
                    </a>
                {/if}
            </div>

            <div class="st-legend" aria-label="Game status">
                {#each Object.values(GAME_STATUS) as st (st.label)}
                    <span class="st-key" style="--s: {st.color};"><span class="st-dot"></span>{st.label}</span>
                {/each}
            </div>

            <!-- One card per game, web and downloadable alike. The game this page is inside
                 links back to its own menu instead of opening itself in a new tab. -->
            {#each [{ title: 'Play in your browser', list: STUDIO.web, kind: 'web' }, { title: 'Download on itch.io', list: STUDIO.downloads, kind: 'dl' }] as group (group.kind)}
                <section class="st-sec">
                    <div class="st-h-row">
                        <h3 class="st-h">{group.title}</h3>
                        {#if group.kind === 'dl'}<a class="st-h-link" href={STUDIO.itch} target="_blank" rel="noopener noreferrer">All downloadable games <Icon name="arrow" size={12} stroke={2.2} /></a>{/if}
                    </div>
                    <div class="st-games">
                        {#each group.list as g (g.id)}
                            {@const st = GAME_STATUS[g.status] || GAME_STATUS.active}
                            <div class="st-game" class:st-featured={g.featured} class:st-retired={g.status === 'retired'} style="--c: {g.color}; --s: {st.color};">
                                <div class="sg-top">
                                    <span class="sg-ico"><Icon name={g.icon} size={20} /></span>
                                    <span class="sg-titles">
                                        <span class="sg-name">{g.name}</span>
                                        <span class="sg-sub">
                                            <span class="sg-status"><span class="st-dot"></span>{st.label}</span>
                                            {#if g.current}<span>· {VERSION} · you are playing it</span>{:else if g.version}<span>· Version {g.version}</span>{/if}
                                        </span>
                                    </span>
                                </div>
                                <p class="sg-desc">{g.blurb}</p>
                                {#if g.credit}<p class="sg-credit"><Icon name="star" size={12} stroke={2.2} /> {g.credit}</p>{/if}
                                <div class="sg-btns">
                                    {#if g.current}
                                        <button class="sg-btn sg-btn-main" on:click={backToMenu}><Icon name="play" size={13} stroke={2.2} /> Play</button>
                                        <button class="sg-btn" on:click={() => openUpdates('menu')}><Icon name="quests" size={13} /> Update Log</button>
                                    {:else}
                                        <a class="sg-btn sg-btn-main" href={g.href} target="_blank" rel="noopener noreferrer">
                                            <Icon name={group.kind === 'dl' ? 'archive' : 'play'} size={13} stroke={2.2} /> {group.kind === 'dl' ? 'Get it on itch.io' : `Play ${g.name}`}
                                        </a>
                                    {/if}
                                    {#each g.extra || [] as x (x.href)}
                                        <a class="sg-btn" href={x.href} target="_blank" rel="noopener noreferrer"><Icon name={x.icon || 'arrow'} size={13} /> {x.label}</a>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </section>
            {/each}

            <section class="st-sec">
                <h3 class="st-h">LoL Ultimate Roster in numbers</h3>
                <div class="st-stats">
                    {#each STUDIO_STATS as st (st.l)}
                        <div class="st-stat"><span class="st-n">{st.n}</span><span class="st-l">{st.l}</span></div>
                    {/each}
                </div>
            </section>

            <section class="st-sec">
                <h3 class="st-h">What we shipped lately</h3>
                <div class="st-rel">
                    {#each UPDATES.slice(0, 4) as u, i (u.ver)}
                        <button class="rel" on:click={() => openUpdates('menu')}>
                            <span class="rel-ver" class:rel-new={i === 0}>{u.ver}</span>
                            <span class="rel-title">{u.title}</span>
                        </button>
                    {/each}
                </div>
            </section>

            {#if STUDIO.team.length}
                <section class="st-sec">
                    <h3 class="st-h">The team</h3>
                    <div class="st-team">
                        {#each STUDIO.team as m (m.name)}
                            <div class="member">
                                <span class="mb-av">{m.name.charAt(0)}</span>
                                <span class="mb-name">{m.name}</span>
                                <span class="mb-role">{m.role}</span>
                                {#if m.blurb}<span class="mb-blurb">{m.blurb}</span>{/if}
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <section class="st-sec">
                <h3 class="st-h">Partners</h3>
                {#each STUDIO.partners as p (p.name)}
                    <a class="partner" href={p.href} target="_blank" rel="noopener noreferrer">
                        <span class="pt-name">{p.name}</span>
                        <span class="pt-blurb">{p.blurb}</span>
                        <Icon name="arrow" size={14} stroke={2.2} />
                    </a>
                {/each}
            </section>

            {#if STUDIO.links.length}
                <section class="st-sec">
                    <h3 class="st-h">Find us</h3>
                    <div class="st-links">
                        {#each STUDIO.links as l (l.href)}
                            <a class="st-link" href={l.href} target="_blank" rel="noopener noreferrer">{#if l.icon}<Icon name={l.icon} size={14} />{/if} {l.label} <Icon name="arrow" size={12} stroke={2.2} /></a>
                        {/each}
                    </div>
                </section>
            {/if}

            <p class="st-fine">LoL Ultimate Roster is a fan-made game. It is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.</p>
        </div>

    {:else if $menuScreen === 'updates'}
        <!-- ══════════════ UPDATE LOG ══════════════ -->
        <div class="stage stage-updates">
            <!-- The way out sits at the TOP: this page is as long as the game's
                 whole history, so a button under the last release is a button
                 nobody scrolls back to. -->
            <div class="sub-topbar">
                <button class="back" on:click={closeUpdates}>
                    <Icon name="chevron" size={14} stroke={2.4} />
                    {$updatesReturn === 'game' ? 'Back to Ultimate Roster' : 'Main menu'}
                </button>
            </div>

            <p class="eyebrow">What's new</p>
            <h2 class="page-h">Update Log</h2>
            <p class="page-sub">Every patch, in full. The newest release is at the top.</p>

            <!-- .stage centres and shrink-wraps its children; the timeline needs
                 the full column. -->
            <div class="uplog-wrap"><UpdateLog /></div>
        </div>

    {:else if $menuScreen === 'loading'}
        <!-- ══════════════ LOADING ══════════════ -->
        <div class="stage stage-load" aria-live="polite" aria-busy={progress < 100}>
            <div class="spin" style="--accent:{loadingMode ? loadingMode.accent : '#3b82f6'}" aria-hidden="true">
                <span></span><span></span>
            </div>
            <h2 class="load-name">{loadingMode ? loadingMode.name : ''}</h2>
            <p class="load-tag">{loadingMode ? loadingMode.tagline : ''}</p>

            <div class="bar" style="--accent:{loadingMode ? loadingMode.accent : '#3b82f6'}">
                <div class="bar-fill" style="width:{progress}%"></div>
            </div>
            <div class="bar-meta">
                <span>{progress < 100 ? 'Loading' : 'Ready'}</span>
                <span class="bar-pct">{String(progress).padStart(3, '0')}</span>
            </div>

            <div class="tipbox">
                {#key tipIndex}
                    <p class="tip"><span class="tip-tag">Tip</span>{TIPS[tipIndex]}</p>
                {/key}
            </div>
        </div>
    {/if}
</section>

<style>
    /* ═══════════ SHELL ═══════════
       In normal flow (not a fixed overlay) so the site footer — "In collaboration with
       SISL" plus the Riot disclaimer — sits underneath the menu exactly as it does on
       every other page. */
    .menu {
        position: relative;
        flex: 1 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        padding: 0 24px;
        overflow: hidden;
    }
    .menu-wash {
        position: absolute;
        inset: -20% -10% auto -10%;
        height: 720px;
        background:
            radial-gradient(ellipse 60% 100% at 50% 0%, rgba(59, 130, 246, 0.12), transparent 70%),
            radial-gradient(ellipse 40% 80% at 82% 22%, rgba(139, 92, 246, 0.09), transparent 70%),
            radial-gradient(ellipse 30% 60% at 12% 40%, rgba(6, 182, 212, 0.05), transparent 70%);
        pointer-events: none;
    }
    .stage {
        position: relative;
        z-index: 1;
        flex: 1 0 auto;
        width: 100%;
        max-width: 1040px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 28px 0 56px;
        animation: rise 0.5s cubic-bezier(0.22, 0.8, 0.3, 1) both;
    }
    @keyframes rise {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
    }

    /* ═══════════ TOP BAR ═══════════ */
    .topbar {
        position: relative; z-index: 2;
        width: 100%; max-width: 1040px;
        display: flex; justify-content: space-between; align-items: center; gap: 10px;
        padding-top: 20px;
    }
    .tb-right { display: flex; gap: 8px; align-items: center; }
    .studio-link { display: inline-flex; align-items: center; gap: 9px; padding: 6px 12px 6px 6px; border-radius: 12px; cursor: pointer; font-family: inherit; background: transparent; border: 1px solid transparent; color: #94a3b8; }
    .studio-link:hover { border-color: rgba(167,139,250,0.35); background: rgba(15,23,42,0.5); color: #e2e8f0; }
    .s8 { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 12px; font-weight: 700; color: #ede9fe; background: linear-gradient(135deg, #4c1d95, #1e1b4b); border: 1px solid rgba(167,139,250,0.4); }
    .studio-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 12.5px; font-weight: 600; letter-spacing: 0.3px; }
    .pill {
        display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 10px;
        font-family: inherit; font-size: 12px; font-weight: 700; letter-spacing: 0.2px; color: #94a3b8;
        background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.45); cursor: pointer;
    }
    .pill:hover { color: #e2e8f0; border-color: rgba(59, 130, 246, 0.45); background: rgba(30, 41, 59, 0.55); }
    .pill-ver { font-size: 10px; font-weight: 900; color: #06b6d4; background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.22); padding: 1px 7px; border-radius: 6px; }
    .pill-login { color: #dbeafe; background: rgba(37,99,235,0.2); border-color: rgba(96,165,250,0.45); }
    .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.7); }
    .pill-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ═══════════ TITLE ═══════════ */
    .title-row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 30px; margin: 10px 0 34px; text-align: left; }
    .title-block { display: flex; flex-direction: column; align-items: flex-start; }
    .mark { width: 64px; height: 64px; margin-bottom: 22px; }
    .mark-mono { font-family: 'Space Grotesk', 'Quicksand', sans-serif; fill: #dbe6f8; }
    .eyebrow { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 4.5px; text-transform: uppercase; color: #4a5b76; margin-bottom: 14px; }
    .eyebrow-accent { color: var(--accent); }
    .wordmark { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: clamp(40px, 6.4vw, 66px); font-weight: 700; line-height: 1; letter-spacing: -0.02em; color: #e8eefb; margin: 0; }
    .wm-thin { font-weight: 400; color: #6f89b3; margin-left: 0.28em; }
    .tagline { font-size: 14px; font-weight: 500; color: #6b7fa3; letter-spacing: 0.2px; margin-top: 16px; }

    .fan { position: relative; width: 330px; height: 250px; flex-shrink: 0; }
    .fan-card {
        position: absolute; left: 50%; top: 4px;
        transform: translateX(calc(-50% + var(--i) * 92px)) rotate(calc(var(--i) * 9deg)) translateY(calc(var(--i) * var(--i) * 14px));
        transform-origin: 50% 100%;
        transition: transform 0.3s ease;
        filter: drop-shadow(0 18px 30px rgba(0,0,0,0.5));
        zoom: 0.82;
    }
    .fan-card:nth-child(2) { z-index: 2; }
    .fan:hover .fan-card { transform: translateX(calc(-50% + var(--i) * 108px)) rotate(calc(var(--i) * 12deg)) translateY(calc(var(--i) * var(--i) * 18px)); }

    /* ═══════════ MODES ═══════════ */
    .modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; width: 100%; margin-bottom: 18px; text-align: left; }
    .mode {
        position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; padding: 22px;
        border-radius: 20px;
        background: radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), rgba(15, 23, 42, 0.6);
        border: 1px solid color-mix(in srgb, var(--accent) 30%, rgba(51, 65, 85, 0.5));
        transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .mode:hover { border-color: color-mix(in srgb, var(--accent) 55%, transparent); transform: translateY(-2px); }
    .mode-head { display: flex; align-items: center; gap: 14px; }
    .mode-ico { flex-shrink: 0; width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, rgba(15,23,42,0.6)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
    .mode-ico :global(svg) { width: 24px; height: 24px; }
    .mode-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
    .mode-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; color: #f1f5f9; }
    .mode-tag { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
    .chip { font-size: 8.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; padding: 3px 8px; border-radius: 5px; color: #7c8ba3; background: rgba(51, 65, 85, 0.35); border: 1px solid rgba(71, 85, 105, 0.4); }
    .mode-desc { font-size: 13px; line-height: 1.65; color: #7b8cab; margin: 0; }
    .mode-feats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .mode-feats li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #cbd5e1; }
    .mode-feats :global(.ico) { color: var(--accent); flex-shrink: 0; }

    .mode-save { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: rgba(2,6,23,0.55); border: 1px solid rgba(71,85,105,0.3); margin-top: auto; }
    .ms-logo { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 21px; background: rgba(15,23,42,0.8); flex-shrink: 0; }
    .ms-ovr { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; font-weight: 900; color: var(--k); background: rgba(15,23,42,0.8); border: 1px solid color-mix(in srgb, var(--k) 45%, transparent); flex-shrink: 0; }
    .ms-empty { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); flex-shrink: 0; }
    .ms-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .ms-name { font-size: 14px; font-weight: 800; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ms-meta { font-size: 11.5px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .mode-btns { display: flex; gap: 8px; }
    .mode-play { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 16px; border-radius: 13px; border: none; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 800; color: #fff; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 85%, #fff 15%), var(--accent)); box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 30%, transparent); transition: transform 0.12s, filter 0.12s; }
    .mode-play:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .mode-slots { display: inline-flex; align-items: center; gap: 7px; padding: 13px 16px; border-radius: 13px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700; color: #cbd5e1; background: rgba(15,23,42,0.6); border: 1px solid rgba(71,85,105,0.45); }
    .mode-slots:hover { color: #fff; border-color: color-mix(in srgb, var(--accent) 50%, transparent); }

    /* ═══════════ TILES ═══════════ */
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; width: 100%; margin-bottom: 26px; text-align: left; }
    .tile { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-radius: 14px; cursor: pointer; font-family: inherit; color: #64748b; text-decoration: none; background: rgba(15,23,42,0.42); border: 1px solid rgba(51,65,85,0.35); transition: border-color 0.16s, background 0.16s; min-width: 0; }
    .tile:hover { background: rgba(20,30,51,0.55); border-color: color-mix(in srgb, var(--c) 45%, transparent); color: var(--c); }
    .tile-ico { flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c) 22%, transparent); }
    .tile-s8 { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 12px; font-weight: 700; color: #ede9fe; background: linear-gradient(135deg, #4c1d95, #1e1b4b); }
    .tile-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .tile-name { display: flex; align-items: center; gap: 6px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 600; color: #cbd5e1; }
    .tile-ver { font-family: inherit; font-size: 9.5px; font-weight: 800; color: #06b6d4; }
    .tile-sub { font-size: 11px; color: #56688a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .foot-note { font-size: 12px; color: #4b5d7a; }
    .foot-note strong { color: #8aa0c4; font-weight: 700; }
    .linkish { background: none; border: none; padding: 0; font: inherit; color: #60a5fa; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
    .build { margin-top: 18px; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; color: #26344c; }

    /* ═══════════ SUB PAGES ═══════════ */
    .sub-topbar { width: 100%; display: flex; margin-bottom: 22px; }
    .back {
        display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px 9px 12px; border-radius: 10px;
        font-family: inherit; font-size: 12px; font-weight: 700; color: #94a3b8;
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    }
    .back :global(.ico) { transform: rotate(180deg); }
    .back:hover { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.65); background: rgba(20, 30, 51, 0.6); }
    .page-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: clamp(28px, 4vw, 40px); font-weight: 700; letter-spacing: -0.02em; color: #e8eefb; margin: 0; }
    .page-sub { font-size: 13px; color: #6b7fa3; margin-top: 12px; margin-bottom: 30px; }

    /* ═══════════ SAVE SLOTS ═══════════ */
    .stage-slots { max-width: 980px; }
    .slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; width: 100%; margin-bottom: 20px; text-align: left; }
    .slot {
        position: relative; overflow: hidden; display: flex; flex-direction: column; border-radius: 18px;
        background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.45);
        transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .slot:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
    .slot-active { border-color: color-mix(in srgb, var(--accent) 60%, transparent); box-shadow: 0 12px 32px color-mix(in srgb, var(--accent) 14%, transparent); }
    .slot-empty { border-style: dashed; background: rgba(15,23,42,0.35); }
    .slot-band { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent); border-bottom: 1px solid rgba(51,65,85,0.35); }
    .slot-empty .slot-band { background: none; }
    .slot-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 10.5px; font-weight: 700; letter-spacing: 2.2px; text-transform: uppercase; color: #8aa0c4; }
    .slot-badge { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #fff; background: var(--accent); }
    .slot-body { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 16px; min-height: 150px; }
    .slot-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .slot-logo { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center; font-size: 26px; flex-shrink: 0; background: color-mix(in srgb, var(--k) 18%, rgba(2,6,23,0.7)); border: 1px solid color-mix(in srgb, var(--k) 45%, transparent); }
    .slot-ovr { width: 46px; height: 46px; border-radius: 13px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px; font-weight: 900; line-height: 1; color: var(--k); background: rgba(2,6,23,0.7); border: 1px solid color-mix(in srgb, var(--k) 45%, transparent); }
    .slot-ovr i { font-style: normal; font-size: 8px; letter-spacing: 1px; color: #64748b; margin-top: 2px; }
    .slot-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .slot-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; font-weight: 700; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .slot-meta { font-size: 11.5px; color: #64748b; }
    .slot-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .slot-stats span { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 10px; border-radius: 10px; background: rgba(2,6,23,0.5); font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #56688a; }
    .slot-stats b { font-size: 15px; font-weight: 900; color: #e2e8f0; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
    .slot-foot { margin-top: auto; font-size: 11.5px; color: #8aa0c4; }
    .slot-new { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; }
    .slot-plus { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); }
    .slot-name-empty { color: #8aa0c4; }
    .slot-actions { display: flex; gap: 8px; padding: 0 16px 16px; }
    .slot-go { flex: 1; padding: 11px; border-radius: 12px; border: none; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 800; color: #fff; background: var(--accent); }
    .slot-empty .slot-go { color: #cbd5e1; background: rgba(15,23,42,0.7); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); }
    .slot-go:hover { filter: brightness(1.1); }
    .slot-del { width: 42px; display: grid; place-items: center; border-radius: 12px; cursor: pointer; color: #64748b; background: rgba(15,23,42,0.6); border: 1px solid rgba(51,65,85,0.45); }
    .slot-del:hover { color: #f87171; border-color: rgba(239,68,68,0.5); background: rgba(127,29,29,0.2); }
    .slot-note { display: flex; gap: 10px; align-items: flex-start; max-width: 680px; text-align: left; font-size: 12px; line-height: 1.6; color: #56688a; }
    .slot-note :global(.ico) { flex-shrink: 0; margin-top: 2px; color: #64748b; }

    /* ═══════════ STUDIO ═══════════ */
    .stage-studio { max-width: 900px; }
    .st-hero { display: flex; flex-direction: column; align-items: center; margin-bottom: 26px; }
    .st-mark { width: 76px; height: 76px; border-radius: 22px; display: grid; place-items: center; margin-bottom: 20px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 28px; font-weight: 700; color: #ede9fe; background: linear-gradient(135deg, #5b21b6, #1e1b4b); border: 1px solid rgba(167,139,250,0.5); box-shadow: 0 16px 40px rgba(91,33,182,0.35); }
    .st-tag { margin-top: 10px; font-size: 15px; font-weight: 600; color: #c4b5fd; }
    .st-intro { margin-top: 12px; max-width: 620px; font-size: 14px; line-height: 1.7; color: #8a9bb8; }
    .st-discord { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; padding: 11px 20px; border-radius: 13px; text-decoration: none; font-size: 14px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #6d74f5, #5865f2); box-shadow: 0 8px 24px rgba(88,101,242,0.35); transition: transform 0.12s, filter 0.12s; }
    .st-discord:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .st-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; width: 100%; }
    .st-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 26px; }
    .st-key { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 100px; font-size: 11.5px; font-weight: 700; color: #cbd5e1; background: rgba(15,23,42,0.55); border: 1px solid rgba(71,85,105,0.35); }
    .st-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--s); box-shadow: 0 0 8px color-mix(in srgb, var(--s) 60%, transparent); }
    .st-h-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .st-h-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: #a78bfa; text-decoration: none; }
    .st-h-link:hover { color: #ddd6fe; }
    .st-featured { grid-column: 1 / -1; }
    .st-featured .sg-name { font-size: 19px; }
    .st-retired { opacity: 0.78; }
    .sg-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; color: var(--s); }
    .sg-sub { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .sg-credit { display: flex; align-items: center; gap: 6px; margin: -4px 0 0; font-size: 12px; font-weight: 700; color: #f9a8d4; }
    .st-link :global(.ico:first-child) { color: #a78bfa; }
    .st-stat { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 14px; background: rgba(15,23,42,0.55); border: 1px solid rgba(71,85,105,0.35); }
    .st-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 26px; font-weight: 700; color: #f1f5f9; font-variant-numeric: tabular-nums; }
    .st-l { font-size: 10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .st-sec { width: 100%; text-align: left; margin-bottom: 26px; }
    .st-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 2.6px; text-transform: uppercase; color: #64748b; margin-bottom: 12px; }
    .st-games { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .st-game { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 18px; background: radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--c) 14%, transparent), transparent 70%), rgba(15,23,42,0.6); border: 1px solid color-mix(in srgb, var(--c) 30%, rgba(51,65,85,0.5)); }
    .sg-top { display: flex; align-items: center; gap: 12px; }
    .sg-ico { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; flex-shrink: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 12%, rgba(2,6,23,0.6)); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
    .sg-titles { display: flex; flex-direction: column; gap: 2px; }
    .sg-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; color: #f1f5f9; }
    .sg-sub { font-size: 11.5px; color: #64748b; }
    .sg-desc { font-size: 13px; line-height: 1.65; color: #8a9bb8; margin: 0; flex: 1; }
    .sg-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sg-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 11px; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #cbd5e1; text-decoration: none; background: rgba(15,23,42,0.7); border: 1px solid rgba(71,85,105,0.45); }
    .sg-btn:hover { color: #fff; border-color: color-mix(in srgb, var(--c) 50%, transparent); }
    .sg-btn-main { color: #fff; background: var(--c); border-color: var(--c); }
    .sg-btn-main:hover { filter: brightness(1.1); }
    .st-rel { display: flex; flex-direction: column; gap: 6px; }
    .rel { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 12px; cursor: pointer; font-family: inherit; text-align: left; background: rgba(15,23,42,0.45); border: 1px solid rgba(51,65,85,0.35); }
    .rel:hover { border-color: rgba(6,182,212,0.4); }
    .rel-ver { flex-shrink: 0; font-size: 10px; font-weight: 900; padding: 3px 9px; border-radius: 6px; color: #67e8f9; background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.25); }
    .rel-new { color: #052e16; background: #34d399; border-color: #34d399; }
    .rel-title { font-size: 13px; font-weight: 600; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .st-team { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
    .member { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 14px; background: rgba(15,23,42,0.55); border: 1px solid rgba(71,85,105,0.35); }
    .mb-av { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 4px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #6d28d9, #2563eb); }
    .mb-name { font-size: 14px; font-weight: 800; color: #e2e8f0; }
    .mb-role { font-size: 11.5px; color: #a78bfa; }
    .mb-blurb { font-size: 12px; color: #64748b; line-height: 1.5; }
    .partner { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; text-decoration: none; color: #64748b; background: rgba(15,23,42,0.45); border: 1px solid rgba(51,65,85,0.35); }
    .partner:hover { border-color: rgba(96,165,250,0.45); color: #60a5fa; }
    .pt-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; color: #e2e8f0; }
    .pt-blurb { flex: 1; font-size: 12.5px; color: #8a9bb8; }
    .st-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .st-link { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 11px; text-decoration: none; font-size: 12.5px; font-weight: 700; color: #cbd5e1; background: rgba(15,23,42,0.6); border: 1px solid rgba(71,85,105,0.45); }
    .st-fine { max-width: 640px; font-size: 11px; line-height: 1.6; color: #3f5069; }

    /* ═══════════ UPDATE LOG SCREEN ═══════════ */
    .stage-updates { max-width: 880px; }
    .uplog-wrap { width: 100%; }

    /* ═══════════ LOADING ═══════════ */
    .stage-load { max-width: 460px; justify-content: center; }
    .spin { position: relative; width: 40px; height: 40px; margin-bottom: 30px; }
    .spin span { position: absolute; inset: 0; border: 2px solid transparent; border-radius: 10px; border-top-color: var(--accent); animation: spin 1.1s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite; }
    .spin span:last-child { inset: 8px; border-top-color: rgba(148, 163, 184, 0.35); animation-duration: 1.7s; animation-direction: reverse; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .load-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: #e8eefb; margin: 0; }
    .load-tag { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 2.4px; text-transform: uppercase; color: #4a5b76; margin-top: 8px; }
    .bar { width: 100%; height: 2px; margin-top: 34px; background: rgba(148, 163, 184, 0.14); border-radius: 2px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 2px; background: var(--accent); transition: width 0.1s linear; }
    .bar-meta { display: flex; justify-content: space-between; width: 100%; margin-top: 10px; font-size: 9.5px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: #3f5069; }
    .bar-pct { font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: #7d93b8; letter-spacing: 1px; }
    .tipbox { margin-top: 40px; min-height: 48px; }
    .tip { font-size: 11.5px; line-height: 1.75; color: #55677f; animation: fade 0.4s ease both; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .tip-tag { display: inline-block; margin-right: 8px; font-size: 8px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 4px; padding: 2px 6px; vertical-align: 1px; }

    /* ═══════════ RESPONSIVE ═══════════ */
    @media (max-width: 900px) {
        .fan { display: none; }
        .title-row { justify-content: center; text-align: center; }
        .title-block { align-items: center; }
        .tiles { grid-template-columns: 1fr; }
        .slots { grid-template-columns: 1fr; }
        .st-games { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
        .menu { padding: 0 16px; }
        .modes { grid-template-columns: 1fr; }
        .mark { width: 52px; height: 52px; margin-bottom: 18px; }
        .stage { padding: 22px 0 40px; }
        .mode { padding: 18px; }
        .pill-hide, .studio-name { display: none; }
        .pill { padding: 9px 11px; }
        .st-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .partner { flex-wrap: wrap; }
    }
</style>
