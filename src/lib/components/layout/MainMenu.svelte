<script>
    import { onDestroy } from 'svelte';
    import { menuScreen, selectedMode, GAMEMODES, CAREER_PILLARS, openMenu } from '../../stores/menu.js';
    import { showAuthPanel } from '../../stores/ui.js';
    import { currentUser } from '../../stores/auth.js';
    import { playSound } from '../../utils/sound.js';

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

    function finish() {
        cleanup();
        progress = 100;
        handoff = setTimeout(() => {
            handoff = null;
            if (loadingMode && loadingMode.available) {
                playSound('win');
                menuScreen.set('game');
            } else {
                menuScreen.set('career');
            }
        }, REDUCED ? 0 : 300);
    }

    function backToMenu() {
        cleanup();
        playSound('click');
        openMenu();
    }

    function playRoster() {
        const roster = GAMEMODES.find(m => m.id === 'roster');
        if (roster) pickMode(roster);
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
                        on:click={() => pickMode(mode)}
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

            <p class="foot-note">
                {#if $currentUser}
                    Signed in as <strong>{$currentUser.displayName || 'manager'}</strong> — cloud saves enabled.
                {:else}
                    Playing as a guest. <button class="linkish" on:click={() => showAuthPanel.set(true)}>Log in</button> to sync your club to the cloud.
                {/if}
            </p>
            <p class="build">Beta 1.6.0 Public Build</p>
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

    {:else if $menuScreen === 'career'}
        <!-- ══════════════ ULTIMATE CAREER ══════════════ -->
        <div class="stage stage-career">
            <span class="chip chip-lg">Ultimate Career — In Development</span>
            <h2 class="career-h">Play as the player.</h2>
            <p class="career-lede">
                Ultimate Career drops the clipboard. You create a single pro — your handle, your role,
                your region — and live their whole career from an unknown academy prospect to a name
                on the Worlds trophy. Same card database, played from the inside.
            </p>

            <ol class="pillars">
                {#each CAREER_PILLARS as p, i}
                    <li class="pillar">
                        <span class="pillar-n">{String(i + 1).padStart(2, '0')}</span>
                        <span class="pillar-b">
                            <span class="pillar-name">{p.name}</span>
                            <span class="pillar-desc">{p.desc}</span>
                        </span>
                    </li>
                {/each}
            </ol>

            <div class="career-actions">
                <button class="btn-quiet" on:click={backToMenu}>Back to Menu</button>
                <button class="btn-solid" on:click={playRoster}>Play Ultimate Roster</button>
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

    /* ═══════════ CAREER ═══════════ */
    .stage-career { max-width: 720px; }
    .chip-lg {
        font-size: 9px;
        letter-spacing: 1.6px;
        padding: 5px 12px;
        color: #a78bfa;
        background: rgba(139, 92, 246, 0.08);
        border-color: rgba(139, 92, 246, 0.25);
        margin-bottom: 22px;
    }
    .career-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: clamp(28px, 4.4vw, 40px);
        font-weight: 700;
        letter-spacing: -0.025em;
        color: #e8eefb;
        margin: 0 0 16px;
    }
    .career-lede {
        font-size: 13px;
        line-height: 1.85;
        color: #5b6d8a;
        max-width: 560px;
        margin: 0 auto 38px;
    }
    .pillars {
        list-style: none;
        width: 100%;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px;
        background: rgba(51, 65, 85, 0.3);
        border: 1px solid rgba(51, 65, 85, 0.3);
        border-radius: 16px;
        overflow: hidden;
        margin: 0 0 38px;
        text-align: left;
    }
    .pillar {
        display: flex;
        gap: 14px;
        padding: 22px 20px;
        background: rgba(12, 18, 33, 0.85);
    }
    .pillar-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px;
        font-weight: 700;
        color: #a78bfa;
        opacity: 0.7;
        padding-top: 2px;
    }
    .pillar-b { display: flex; flex-direction: column; gap: 6px; }
    .pillar-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #cbd5e1;
    }
    .pillar-desc { font-size: 11.5px; line-height: 1.65; color: #55677f; }

    .career-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    .btn-quiet, .btn-solid {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: 0.2px;
        padding: 12px 24px;
        border-radius: 11px;
        cursor: pointer;
    }
    .btn-quiet {
        color: #94a3b8;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.45);
    }
    .btn-quiet:hover { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.7); }
    .btn-solid {
        color: #fff;
        background: #2563eb;
        border: 1px solid #3b82f6;
    }
    .btn-solid:hover { background: #3b82f6; }

    /* ═══════════ RESPONSIVE ═══════════ */
    @media (max-width: 760px) {
        .menu { padding: 0 16px; }
        .modes, .pillars { grid-template-columns: 1fr; }
        .mark { width: 52px; height: 52px; margin-bottom: 20px; }
        .tagline { margin-bottom: 32px; }
        .stage { padding: 28px 0 40px; }
        .mode { padding: 20px 18px; }
    }
</style>
