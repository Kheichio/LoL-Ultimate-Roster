<script>
    import { onDestroy } from 'svelte';
    import {
        menuScreen, selectedMode, GAMEMODES, MORE_GAMES, openMenu,
        setBootIntent, takeBootIntent, currentSlot,
        openUpdates, closeUpdates, updatesReturn,
    } from '../../stores/menu.js';
    import UpdateLog from './UpdateLog.svelte';
    import { UPDATES } from '../../utils/updates.js';
    import { showAuthPanel, openConfirmModal } from '../../stores/ui.js';
    import { currentUser } from '../../stores/auth.js';
    import { playSound } from '../../utils/sound.js';
    import {
        SLOT_IDS, setActiveSlot, activeSlot, clearSlot,
    } from '../../utils/storage.js';
    import { careerSlotSummary, flushCareer } from '../../stores/career.js';
    import { rosterSlotSummary, flushGame } from '../../stores/game.js';
    import { ROLE_BY_ID, REGION_BY_ID } from '../../career/constants.js';
    import { ovrTier } from '../../career/ratings.js';

    const REDUCED = typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const TIPS = [
        'Chemistry beats raw rating — one region, one era and one team hits the cap.',
        'Signature cards add +2 to every stat. Holographics add +1. They stack.',
        'Only two Hall of Legends cards exist in the whole game: Faker and Uzi.',
        'Coaches never enter the fight — their rating buffs the entire starting five.',
        'The Gaming Cafe is free to enter. Win there first, then buy better packs.',
        'Ten Bronze cards of the same role upgrade into a Silver. Keep your duplicates.',
        'Roster Building Challenges reset daily and pay out free packs.',
        'Sell what you will never field — Blue Essence is tighter than it looks.',
        'The Academy farms Blue Essence in the background while you play.',
        'Every card you ever own is logged in the Archive, even after you sell it.',
    ];

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

    $: slotCards = (slotMode && slotRefresh >= 0)
        ? SLOT_IDS.map(n => ({
            n,
            active: n === currentSlot(slotMode.id),
            career: slotMode.id === 'career' ? careerSlotSummary(n) : null,
            roster: slotMode.id === 'roster' ? rosterSlotSummary(n) : null,
        }))
        : [];

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
</script>

<section class="menu">
    <div class="menu-wash" aria-hidden="true"></div>

    {#if $menuScreen === 'menu'}
        <!-- ══════════════ MAIN MENU ══════════════ -->
        <div class="topbar">
            {#if $currentUser}
                <button class="pill pill-in" on:click={() => showAuthPanel.set(true)}>
                    <span class="pill-dot"></span>
                    <span class="pill-name">{$currentUser.displayName || 'Signed in'}</span>
                </button>
            {:else}
                <button class="pill" on:click={() => { playSound('click'); showAuthPanel.set(true); }}>
                    Log In / Register
                </button>
            {/if}
        </div>

        <div class="stage">
            <!-- Logo: a "UR" monogram set in the same modernist grotesque as the wordmark,
                 inside a rounded tile, with a five-segment rule under it — one segment per
                 role, the MID one accented. Typographic rather than illustrative, so it
                 reads as a brand mark instead of a stock icon. -->
            <svg class="mark" viewBox="0 0 72 72" fill="none" role="img" aria-label="LoL Ultimate Roster">
                <rect x="1.75" y="1.75" width="68.5" height="68.5" rx="20" stroke="#2c3f5c" stroke-width="2.5" />
                <text class="mark-mono" x="36" y="43.5" text-anchor="middle"
                      font-size="29" font-weight="700" letter-spacing="-1.4">UR</text>
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

            <div class="modes">
                {#each GAMEMODES as mode}
                    <button
                        class="mode"
                        class:mode-soon={!mode.available}
                        style="--accent:{mode.accent}"
                        on:click={() => (mode.available ? openSlots(mode) : pickMode(mode))}
                    >
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
                        <span class="mode-txt">
                            <span class="mode-row">
                                <span class="mode-name">{mode.name}</span>
                                {#if !mode.available}<span class="chip">Soon</span>{/if}
                            </span>
                            <span class="mode-tag">{mode.tagline}</span>
                            <span class="mode-desc">{mode.desc}</span>
                        </span>
                        <span class="mode-arrow" aria-hidden="true">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M6 3l5 5-5 5" />
                            </svg>
                        </span>
                    </button>
                {/each}
            </div>

            <!-- The changelog. It sits on the title screen rather than inside
                 Ultimate Roster because it describes the whole product, and a
                 player should not have to load a save to find out what changed. -->
            <button class="uplink" on:click={() => { playSound('click'); openUpdates('menu'); }}>
                <span class="uplink-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 4.5h14v15H5z" />
                        <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
                    </svg>
                </span>
                <span class="uplink-txt">
                    <span class="uplink-name">Update Log</span>
                    <span class="uplink-blurb">{UPDATES[0].title}</span>
                </span>
                <span class="uplink-ver">{UPDATES[0].ver}</span>
            </button>

            <!-- Other Studio8Heads titles. Deliberately quieter than the gamemode
                 buttons so it never competes with the primary choice. -->
            <section class="more">
                <p class="more-h"><span>More games by us</span></p>
                <div class="more-list">
                    {#each MORE_GAMES as g (g.id)}
                        <a class="game" href={g.href} target="_blank" rel="noopener noreferrer">
                            <span class="game-ico" aria-hidden="true">
                                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                                    <circle cx="16" cy="16" r="10.5" />
                                    <path d="M5.5 16h21" />
                                    <circle cx="16" cy="16" r="2.7" fill="currentColor" stroke="none" />
                                </svg>
                            </span>
                            <span class="game-txt">
                                <span class="game-name">{g.name}</span>
                                <span class="game-blurb">{g.blurb}</span>
                            </span>
                            <span class="game-play">Play</span>
                            <svg class="game-ext" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                                 stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M6 3.5h6.5V10" /><path d="M12.5 3.5 4 12" />
                            </svg>
                        </a>
                    {/each}
                </div>
            </section>

            <p class="foot-note">
                {#if $currentUser}
                    Signed in as <strong>{$currentUser.displayName || 'manager'}</strong> — cloud saves enabled.
                {:else}
                    Playing as a guest. <button class="linkish" on:click={() => showAuthPanel.set(true)}>Log in</button> to sync your club to the cloud.
                {/if}
            </p>
            <p class="build">Beta 1.7.4 Public Build</p>
        </div>

    {:else if $menuScreen === 'slots' && slotMode}
        <!-- ══════════════ SAVE SLOTS ══════════════ -->
        <div class="stage stage-slots" style="--accent:{slotMode.accent}">
            <p class="eyebrow">{slotMode.name}</p>
            <h2 class="slot-h">Choose a save</h2>
            <p class="slot-sub">
                Three slots, kept completely apart. Nothing you do in one reaches another.
            </p>

            <div class="slots">
                {#each slotCards as s (s.n)}
                    {@const used = !!(s.career || s.roster)}
                    <div class="slot" class:slot-empty={!used} class:slot-active={s.active}>
                        <button class="slot-hit" on:click={() => chooseSlot(s.n)}>
                            <span class="slot-top">
                                <span class="slot-n">Slot {s.n}</span>
                                {#if s.active}<span class="slot-badge">Loaded</span>{/if}
                            </span>

                            {#if s.career}
                                <span class="slot-name">{s.career.handle}</span>
                                <span class="slot-meta">{slotRoleLine(s.career)}</span>
                                <span class="slot-stats">
                                    <span class="slot-stat" style="--k:{ovrTier(s.career.ovr).color}">
                                        <b>{s.career.ovr}</b><i>OVR</i>
                                    </span>
                                    <span class="slot-stat"><b>{s.career.age}</b><i>years old</i></span>
                                    <span class="slot-stat"><b>{s.career.trophies}</b><i>trophies</i></span>
                                </span>
                                <span class="slot-foot">
                                    {s.career.retired ? 'Retired' : s.career.team} &#183; {s.career.year} season
                                </span>
                            {:else if s.roster}
                                <span class="slot-name">
                                    <span class="slot-logo" aria-hidden="true">{s.roster.logo}</span>
                                    {s.roster.name}
                                </span>
                                <span class="slot-meta">Level {s.roster.level}{s.roster.prestige ? ` · Prestige ${s.roster.prestige}` : ''}</span>
                                <span class="slot-stats">
                                    <span class="slot-stat" style="--k:{s.roster.color}"><b>{s.roster.clubSize}</b><i>cards</i></span>
                                    <span class="slot-stat"><b>{s.roster.trophies}</b><i>trophies</i></span>
                                </span>
                                <span class="slot-foot">{s.roster.be.toLocaleString()} Blue Essence</span>
                            {:else}
                                <span class="slot-name slot-name-empty">Empty</span>
                                <span class="slot-meta">
                                    {slotMode.id === 'career' ? 'Create a player here' : 'Start a new club here'}
                                </span>
                            {/if}
                        </button>

                        {#if used}
                            <button class="slot-del" on:click={() => wipeSlot(s.n)} aria-label="Delete slot {s.n}">
                                Delete
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>

            <p class="slot-note">
                {#if slotMode.id === 'career'}
                    Career saves live on this device only &#8212; they are never uploaded, and the
                    cloud save has no idea they exist.
                {:else}
                    Cloud sync follows whichever slot is loaded. Log in on another device and it
                    restores into the slot you have open there.
                {/if}
            </p>

            <button class="slot-back" on:click={backToMenu}>Back</button>
        </div>

    {:else if $menuScreen === 'updates'}
        <!-- ══════════════ UPDATE LOG ══════════════ -->
        <div class="stage stage-updates">
            <!-- The way out sits at the TOP: this page is as long as the game's
                 whole history, so a button under the last release is a button
                 nobody scrolls back to. -->
            <div class="up-topbar">
                <button class="up-back" on:click={closeUpdates}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M10 3L5 8l5 5" />
                    </svg>
                    {$updatesReturn === 'game' ? 'Back to Ultimate Roster' : 'Back'}
                </button>
            </div>

            <p class="eyebrow">What's new</p>
            <h2 class="slot-h">Update Log</h2>
            <p class="slot-sub">Every patch, in full. The newest release is at the top.</p>

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
        height: 620px;
        background:
            radial-gradient(ellipse 60% 100% at 50% 0%, rgba(59, 130, 246, 0.10), transparent 70%),
            radial-gradient(ellipse 40% 80% at 82% 22%, rgba(139, 92, 246, 0.07), transparent 70%);
        pointer-events: none;
    }

    /* ═══════════ TOP BAR ═══════════ */
    .topbar {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 940px;
        display: flex;
        justify-content: flex-end;
        padding-top: 22px;
    }
    .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 18px;
        border-radius: 10px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2px;
        color: #94a3b8;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.4);
        cursor: pointer;
    }
    .pill:hover { color: #e2e8f0; border-color: rgba(59, 130, 246, 0.4); background: rgba(30, 41, 59, 0.5); }
    .pill-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.7);
    }
    .pill-name { max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ═══════════ STAGE ═══════════ */
    .stage {
        position: relative;
        z-index: 1;
        flex: 1 0 auto;
        width: 100%;
        max-width: 940px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 0 56px;
        animation: rise 0.5s cubic-bezier(0.22, 0.8, 0.3, 1) both;
    }
    @keyframes rise {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
    }

    /* ═══════════ LOGO ═══════════ */
    .mark {
        width: 76px;
        height: 76px;
        margin-bottom: 28px;
    }
    .mark-mono {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        fill: #dbe6f8;
    }

    .eyebrow {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 4.5px;
        text-transform: uppercase;
        color: #4a5b76;
        margin-bottom: 14px;
    }
    .wordmark {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: clamp(38px, 6.4vw, 62px);
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.02em;
        color: #e8eefb;
        margin: 0;
    }
    .wm-thin {
        font-weight: 400;
        color: #6f89b3;
        margin-left: 0.32em;
    }
    .tagline {
        font-size: 13px;
        font-weight: 500;
        color: #566a8c;
        letter-spacing: 0.2px;
        margin-top: 18px;
        margin-bottom: 46px;
        position: relative;
    }
    .tagline::before {
        content: '';
        position: absolute;
        top: -19px;
        left: 50%;
        width: 34px;
        height: 1px;
        margin-left: -17px;
        background: rgba(99, 130, 180, 0.35);
    }

    /* ═══════════ MODES ═══════════ */
    .modes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        width: 100%;
        margin-bottom: 30px;
    }
    .mode {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 16px;
        text-align: left;
        padding: 24px 22px;
        border-radius: 16px;
        cursor: pointer;
        font-family: inherit;
        color: inherit;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.4);
        transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    }
    .mode::after {
        content: '';
        position: absolute;
        left: 22px; right: 22px; top: -1px;
        height: 1px;
        background: var(--accent);
        opacity: 0;
        transition: opacity 0.18s ease;
    }
    .mode:hover {
        transform: translateY(-2px);
        background: rgba(20, 30, 51, 0.6);
        border-color: rgba(71, 85, 105, 0.65);
    }
    .mode:hover::after { opacity: 0.7; }
    .mode:active { transform: translateY(0); }

    .mode-ico {
        flex-shrink: 0;
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 11px;
        background: rgba(30, 41, 59, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.45);
        color: var(--accent);
        transition: border-color 0.18s ease;
    }
    .mode-ico :global(svg) { width: 22px; height: 22px; }
    .mode:hover .mode-ico { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }

    .mode-txt { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .mode-row { display: flex; align-items: center; gap: 8px; }
    .mode-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #e2e8f0;
    }
    .chip {
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 5px;
        color: #7c8ba3;
        background: rgba(51, 65, 85, 0.35);
        border: 1px solid rgba(71, 85, 105, 0.4);
    }
    .mode-tag {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--accent);
        opacity: 0.85;
    }
    .mode-desc { font-size: 12px; line-height: 1.7; color: #5b6d8a; }

    .mode-arrow {
        margin-left: auto;
        align-self: center;
        width: 16px; height: 16px;
        color: #475569;
        transition: transform 0.18s ease, color 0.18s ease;
    }
    .mode-arrow :global(svg) { width: 16px; height: 16px; }
    .mode:hover .mode-arrow { color: var(--accent); transform: translateX(3px); }
    .mode-soon .mode-desc { color: #4c5c76; }

    /* ═══════════ UPDATE LOG LINK ═══════════ */
    /* Sits between the gamemodes and the external links: louder than an outbound
       link, quieter than a mode button, because it is product news rather than a
       thing you came here to play. */
    .uplink {
        display: flex;
        align-items: center;
        gap: 13px;
        width: 100%;
        padding: 13px 16px;
        margin-bottom: 26px;
        border-radius: 12px;
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        background: rgba(15, 23, 42, 0.34);
        border: 1px solid rgba(51, 65, 85, 0.3);
        transition: border-color 0.16s ease, background 0.16s ease;
    }
    .uplink:hover {
        background: rgba(20, 30, 51, 0.5);
        border-color: rgba(6, 182, 212, 0.4);
    }
    .uplink-ico {
        flex-shrink: 0;
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        color: #06b6d4;
    }
    .uplink-ico :global(svg) { width: 19px; height: 19px; }
    .uplink-txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .uplink-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 13px; font-weight: 700; color: #cbd5e1;
    }
    .uplink-blurb {
        font-size: 11px; color: #5b6d8a; line-height: 1.5;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .uplink-ver {
        margin-left: auto;
        flex-shrink: 0;
        font-size: 10px; font-weight: 900; letter-spacing: 0.5px;
        color: #06b6d4;
        background: rgba(6, 182, 212, 0.1);
        border: 1px solid rgba(6, 182, 212, 0.18);
        padding: 3px 10px; border-radius: 6px;
    }

    /* ═══════════ UPDATE LOG SCREEN ═══════════ */
    .stage-updates { max-width: 880px; }
    .uplog-wrap { width: 100%; }

    /* Left-aligned inside a stage that centres everything else, so it reads as
       navigation rather than as part of the page's own heading block. */
    .up-topbar { width: 100%; display: flex; margin-bottom: 22px; }
    .up-back {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 9px 16px 9px 12px;
        border-radius: 10px;
        font-family: inherit;
        font-size: 12px; font-weight: 700;
        color: #94a3b8;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.4);
        cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    }
    .up-back:hover {
        color: #e2e8f0;
        border-color: rgba(71, 85, 105, 0.65);
        background: rgba(20, 30, 51, 0.6);
    }
    .up-back svg { width: 14px; height: 14px; flex-shrink: 0; }
    .up-back:hover svg { color: #60a5fa; }

    /* ═══════════ MORE GAMES ═══════════ */
    .more { width: 100%; margin-bottom: 26px; }
    .more-h {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 9.5px;
        font-weight: 500;
        letter-spacing: 2.6px;
        text-transform: uppercase;
        color: #43536d;
    }
    /* hairlines either side of the label */
    .more-h::before, .more-h::after {
        content: '';
        flex: 1;
        height: 1px;
        background: rgba(51, 65, 85, 0.35);
    }
    .more-list { display: flex; flex-direction: column; gap: 8px; }

    .game {
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 13px 16px;
        border-radius: 12px;
        text-decoration: none;
        text-align: left;
        background: rgba(15, 23, 42, 0.34);
        border: 1px solid rgba(51, 65, 85, 0.3);
        transition: border-color 0.16s ease, background 0.16s ease;
    }
    .game:hover {
        background: rgba(20, 30, 51, 0.5);
        border-color: rgba(34, 211, 238, 0.35);
    }
    .game-ico {
        flex-shrink: 0;
        width: 32px; height: 32px;
        display: grid; place-items: center;
        border-radius: 9px;
        color: #22d3ee;
        background: rgba(34, 211, 238, 0.07);
        border: 1px solid rgba(34, 211, 238, 0.16);
    }
    .game-ico :global(svg) { width: 17px; height: 17px; }
    .game-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .game-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #cbd5e1;
    }
    .game-blurb { font-size: 11px; line-height: 1.5; color: #4e5f7a; }
    .game-play {
        margin-left: auto;
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        color: #45596f;
        white-space: nowrap;
        transition: color 0.16s ease;
    }
    .game:hover .game-play { color: #22d3ee; }
    .game-ext {
        flex-shrink: 0;
        width: 13px; height: 13px;
        color: #3f5069;
        transition: color 0.16s ease, transform 0.16s ease;
    }
    .game:hover .game-ext { color: #22d3ee; transform: translate(2px, -2px); }
    .game:hover .game-name { color: #e2e8f0; }

    @media (max-width: 620px) {
        .game-play { display: none; }
    }

    .foot-note { font-size: 11.5px; color: #3f5069; }
    .foot-note strong { color: #7d93b8; font-weight: 700; }
    .linkish {
        background: none; border: none; padding: 0;
        font: inherit; color: #60a5fa; font-weight: 700; cursor: pointer;
        text-decoration: underline; text-underline-offset: 2px;
    }
    .build {
        margin-top: 24px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.8px;
        color: #26344c;
    }

    /* ═══════════ SAVE SLOTS ═══════════ */
    .stage-slots { max-width: 900px; }
    .slot-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: clamp(26px, 4vw, 36px);
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #e8eefb;
        margin: 0;
    }
    .slot-sub {
        font-size: 12.5px;
        color: #566a8c;
        margin-top: 12px;
        margin-bottom: 34px;
    }

    .slots {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        width: 100%;
        margin-bottom: 26px;
    }
    .slot {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.4);
        transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
    }
    .slot:hover { transform: translateY(-2px); background: rgba(20, 30, 51, 0.6); border-color: rgba(71, 85, 105, 0.7); }
    .slot-active { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
    .slot-empty { border-style: dashed; }

    .slot-hit {
        display: flex;
        flex-direction: column;
        gap: 7px;
        flex: 1;
        text-align: left;
        padding: 20px 18px 16px;
        border: none;
        background: none;
        font-family: inherit;
        color: inherit;
        cursor: pointer;
    }
    .slot-top { display: flex; align-items: center; gap: 8px; }
    .slot-n {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 9.5px; font-weight: 700; letter-spacing: 2.2px; text-transform: uppercase;
        color: #4a5b76;
    }
    .slot-badge {
        font-size: 8.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
    }
    .slot-name {
        display: flex; align-items: center; gap: 8px;
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 18px; font-weight: 700; color: #e2e8f0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .slot-name-empty { color: #3f5069; font-weight: 500; }
    .slot-logo { font-size: 17px; }
    .slot-meta { font-size: 11px; color: #56688a; }

    .slot-stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
    .slot-stat { display: flex; align-items: baseline; gap: 4px; }
    .slot-stat b {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 15px; font-weight: 700; color: var(--k, #7d93b8);
    }
    .slot-stat i { font-style: normal; font-size: 9.5px; color: #45596f; }

    .slot-foot { margin-top: auto; padding-top: 8px; font-size: 10.5px; color: #3f5069; }

    .slot-del {
        margin: 0 12px 12px;
        padding: 7px 0;
        border-radius: 8px;
        font-family: inherit;
        font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
        color: #56688a;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.35);
        cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease;
    }
    .slot-del:hover { color: #f87171; border-color: rgba(239, 68, 68, 0.4); }

    .slot-note {
        font-size: 11.5px; line-height: 1.7; color: #45596f;
        max-width: 620px; margin-bottom: 22px;
    }
    .slot-back {
        padding: 10px 26px;
        border-radius: 10px;
        font-family: inherit;
        font-size: 12px; font-weight: 700;
        color: #94a3b8;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.4);
        cursor: pointer;
    }
    .slot-back:hover { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.65); }

    /* ═══════════ LOADING ═══════════ */
    .stage-load { max-width: 460px; }
    .spin {
        position: relative;
        width: 40px; height: 40px;
        margin-bottom: 30px;
    }
    .spin span {
        position: absolute; inset: 0;
        border: 2px solid transparent;
        border-radius: 10px;
        border-top-color: var(--accent);
        animation: spin 1.1s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite;
    }
    .spin span:last-child {
        inset: 8px;
        border-top-color: rgba(148, 163, 184, 0.35);
        animation-duration: 1.7s;
        animation-direction: reverse;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .load-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #e8eefb;
        margin: 0;
    }
    .load-tag {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 2.4px;
        text-transform: uppercase;
        color: #4a5b76;
        margin-top: 8px;
    }
    .bar {
        width: 100%;
        height: 2px;
        margin-top: 34px;
        background: rgba(148, 163, 184, 0.14);
        border-radius: 2px;
        overflow: hidden;
    }
    .bar-fill {
        height: 100%;
        border-radius: 2px;
        background: var(--accent);
        transition: width 0.1s linear;
    }
    .bar-meta {
        display: flex;
        justify-content: space-between;
        width: 100%;
        margin-top: 10px;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        color: #3f5069;
    }
    .bar-pct { font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: #7d93b8; letter-spacing: 1px; }

    .tipbox { margin-top: 40px; min-height: 48px; }
    .tip {
        font-size: 11.5px;
        line-height: 1.75;
        color: #55677f;
        animation: fade 0.4s ease both;
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .tip-tag {
        display: inline-block;
        margin-right: 8px;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        color: #60a5fa;
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 4px;
        padding: 2px 6px;
        vertical-align: 1px;
    }

    /* ═══════════ RESPONSIVE ═══════════ */
    @media (max-width: 760px) {
        .menu { padding: 0 16px; }
        .modes { grid-template-columns: 1fr; }
        .slots { grid-template-columns: 1fr; }
        .mark { width: 52px; height: 52px; margin-bottom: 20px; }
        .tagline { margin-bottom: 32px; }
        .stage { padding: 28px 0 40px; }
        .mode { padding: 20px 18px; }
    }
</style>
