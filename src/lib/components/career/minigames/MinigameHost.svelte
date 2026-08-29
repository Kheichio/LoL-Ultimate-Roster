<script>
    // =====================================================================
    //  MINIGAME HOST - full-screen shell for one training drill
    //
    //  The training screen hands this component a drill object and two
    //  callbacks. Everything else - which minigame runs, the chrome around
    //  it, escape handling, focus and body scroll - lives here, so the eight
    //  games stay self-contained and know nothing about career state.
    //
    //  Contract of every minigame in this folder:
    //      export let difficulty = 1;      // 1 Basic, 2 Advanced, 3 Elite
    //      export let drill = null;        // { id, attr, name, desc }
    //      export let onComplete = null;   // (score01, meta) => void
    //      export let onQuit = null;       // () => void
    // =====================================================================
    import { onMount, onDestroy, tick } from 'svelte';
    import { ATTRS, ATTR_BY_KEY } from '../../../career/constants.js';

    import ComboGame from './ComboGame.svelte';
    import WaveControlGame from './WaveControlGame.svelte';
    import WardMemoryGame from './WardMemoryGame.svelte';
    import FocusFireGame from './FocusFireGame.svelte';
    import ClutchGame from './ClutchGame.svelte';
    import ShotcallGame from './ShotcallGame.svelte';
    import ChampPoolGame from './ChampPoolGame.svelte';
    import KnowledgeGame from './KnowledgeGame.svelte';

    export let drill = null;        // { id, attr, name, desc, game, difficulty }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    const X_MARK = '\u2715';
    const WARN = '\u26A0';

    // game id (constants.js ATTRS[].game) -> component
    const GAMES = {
        combo: ComboGame,
        wave: WaveControlGame,
        ward: WardMemoryGame,
        focus: FocusFireGame,
        clutch: ClutchGame,
        shotcall: ShotcallGame,
        pool: ChampPoolGame,
        knowledge: KnowledgeGame,
    };

    const TIER_NAMES = { 1: 'Basic', 2: 'Advanced', 3: 'Elite' };

    const FOCUSABLE = [
        'a[href]', 'area[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])', 'textarea:not([disabled])',
        'iframe', 'object', 'embed',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    // The overlay has to be positioned against the VIEWPORT, but career screens
    // render inside CareerShell's .cscreen, which runs a transform animation
    // with fill-mode:both. A filling transform animation makes an element a
    // containing block for its fixed-position descendants, so `position: fixed`
    // would resolve against that screen rather than the window - the drill then
    // renders partly off-screen and, for the map drill, is unplayable because
    // icons flash for as little as 350ms. Re-parenting to <body> removes the
    // entire class of problem regardless of what any ancestor ever does.
    function portal(node) {
        if (typeof document === 'undefined') return {};
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) node.parentNode.removeChild(node);
            },
        };
    }

    let overlay = null;
    let panel = null;
    let prevFocus = null;
    let prevOverflow = '';
    let prevKey = null;
    let lastQuitAt = 0;
    let lastDoneAt = 0;

    // ---------------------------------------------------------------- resolve
    //  drill.game is the first authority. If it is missing or names a game
    //  that does not exist, fall back to the ATTRS table for drill.attr, then
    //  to the attribute prefix of a drill id like 'mec_2'. If all three miss
    //  we render an explicit "drill unavailable" panel instead of a blank box.
    function norm(v) {
        return typeof v === 'string' ? v.trim().toLowerCase() : '';
    }

    function gameForAttr(attrKey) {
        const meta = ATTR_BY_KEY[attrKey];
        return meta && GAMES[meta.game] ? meta.game : '';
    }

    function resolveGameId(d) {
        if (!d) return '';
        const direct = norm(d.game);
        if (direct && GAMES[direct]) return direct;

        const byAttr = gameForAttr(norm(d.attr));
        if (byAttr) return byAttr;

        const id = norm(d.id);
        const prefix = id.indexOf('_') > 0 ? id.slice(0, id.indexOf('_')) : id;
        const byId = gameForAttr(prefix);
        if (byId) return byId;

        return '';
    }

    function clamp3(n) {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v)) return 1;
        return Math.max(1, Math.min(3, v));
    }

    $: gameId = resolveGameId(drill);
    $: Cmp = gameId ? GAMES[gameId] : null;
    $: level = clamp3(drill ? drill.difficulty : 1);

    $: attrMeta = (drill && ATTR_BY_KEY[norm(drill.attr)])
        || (gameId ? ATTRS.find(a => a.game === gameId) : null)
        || null;

    $: accent = (attrMeta && attrMeta.color)
        || (drill && typeof drill.accent === 'string' ? drill.accent : '')
        || '#94a3b8';
    $: attrName = attrMeta ? attrMeta.name : 'Training';
    $: attrAbbr = attrMeta ? attrMeta.abbr : '---';
    $: drillName = (drill && drill.name) ? String(drill.name) : 'Training Drill';
    $: tierName = (drill && drill.tierName) ? String(drill.tierName) : TIER_NAMES[level];
    $: ariaLabel = attrName + ' drill: ' + drillName;

    // Remount the minigame from scratch whenever the host is pointed at a
    // different drill or difficulty, and clear the callback de-dupe with it.
    $: runKey = (drill ? (drill.id || gameId || 'drill') : 'none') + '|' + gameId + '|' + level;
    $: if (runKey !== prevKey) { prevKey = runKey; lastQuitAt = 0; lastDoneAt = 0; }

    // ---------------------------------------------------------------- exits
    //  Both callbacks are funnelled through here, so a game that fires its own
    //  quit in the same tick as an Escape keypress cannot call onQuit twice.
    function quit() {
        const now = Date.now();
        if (now - lastQuitAt < 500) return;
        lastQuitAt = now;
        if (typeof onQuit === 'function') onQuit();
    }

    function finish(score01, meta) {
        const now = Date.now();
        if (now - lastDoneAt < 500) return;
        lastDoneAt = now;
        if (typeof onComplete === 'function') onComplete(score01, meta || {});
    }

    // ---------------------------------------------------------------- focus
    function focusables() {
        if (!overlay) return [];
        const list = Array.prototype.slice.call(overlay.querySelectorAll(FOCUSABLE));
        return list.filter(function (el) {
            if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
            return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        });
    }

    function trapTab(e) {
        const list = focusables();
        if (!list.length) {
            e.preventDefault();
            if (panel) panel.focus();
            return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        const inside = overlay && active && overlay.contains(active);

        if (!inside) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
            return;
        }
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // Capture phase, window level: Escape is swallowed here so the minigames
    // never see it and never fire a second onQuit. Every other key - letters,
    // digits, space, arrows, Enter - is left completely alone.
    function onKeydown(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            e.stopPropagation();
            quit();
            return;
        }
        if (e.key === 'Tab') trapTab(e);
    }

    onMount(function () {
        if (typeof document === 'undefined') return;

        prevFocus = document.activeElement;
        prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeydown, true);

        // Only claim focus if the mounted minigame has not already taken it
        // (several of them autofocus their own Start button).
        tick().then(function () {
            if (!overlay || !panel) return;
            const active = document.activeElement;
            if (active && overlay.contains(active) && active !== document.body) return;
            try { panel.focus({ preventScroll: true }); } catch (err) { panel.focus(); }
        });
    });

    onDestroy(function () {
        if (typeof document === 'undefined') return;

        window.removeEventListener('keydown', onKeydown, true);
        document.body.style.overflow = prevOverflow;

        if (prevFocus && typeof prevFocus.focus === 'function' && prevFocus.isConnected) {
            try { prevFocus.focus({ preventScroll: true }); } catch (err) { /* gone */ }
        }
        prevFocus = null;
    });
</script>

<div
    class="mh-over"
    use:portal
    bind:this={overlay}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
>
    <div class="mh-bg" aria-hidden="true"></div>

    <div class="mh-panel" bind:this={panel} tabindex="-1" style="--accent:{accent}">

        <div class="mh-head">
            <span class="mh-dot" aria-hidden="true"></span>
            <span class="mh-attr">{attrName}</span>
            <span class="mh-abbr" aria-hidden="true">{attrAbbr}</span>
            <span class="mh-sep" aria-hidden="true"></span>
            <span class="mh-name" title={drillName}>{drillName}</span>

            <span class="mh-tier">{tierName}</span>
            <span class="mh-pips" role="img" aria-label={'Difficulty ' + level + ' of 3'}>
                <span class="mh-pip" class:on={level >= 1}></span>
                <span class="mh-pip" class:on={level >= 2}></span>
                <span class="mh-pip" class:on={level >= 3}></span>
            </span>

            <button class="mh-x" type="button" title="Leave drill (Esc)" aria-label="Leave drill" on:click={quit}>
                {X_MARK}
            </button>
        </div>

        <div class="mh-body">
            {#if Cmp}
                {#key runKey}
                    <svelte:component
                        this={Cmp}
                        difficulty={level}
                        {drill}
                        onComplete={finish}
                        onQuit={quit}
                    />
                {/key}
            {:else}
                <div class="mh-miss">
                    <div class="mh-miss-ico" aria-hidden="true">{WARN}</div>
                    <div class="mh-miss-h">Drill unavailable</div>
                    <p class="mh-miss-p">
                        There is no minigame wired up for this drill yet, so there is nothing to play.
                        Your energy and gold have not been spent.
                    </p>
                    <p class="mh-miss-meta">
                        drill: <strong>{(drill && drill.id) ? drill.id : 'none'}</strong>
                        &middot; attribute: <strong>{(drill && drill.attr) ? drill.attr : 'none'}</strong>
                        &middot; game: <strong>{(drill && drill.game) ? drill.game : 'none'}</strong>
                    </p>
                    <button class="mh-miss-btn" type="button" on:click={quit}>Back to training</button>
                </div>
            {/if}
        </div>

    </div>
</div>

<style>
    /* ---- overlay ---------------------------------------------------- */
    .mh-over {
        position: fixed;
        inset: 0;
        z-index: 120;
        display: flex;
        justify-content: center;
        padding: 14px;
        /* Last-resort escape hatch: if a drill's content still cannot fit the
           capped panel, the overlay itself scrolls rather than clipping. */
        overflow-y: auto;
        overscroll-behavior: contain;
    }
    .mh-bg {
        /* Fixed, not absolute: when the overlay scrolls, an absolute backdrop
           would scroll away with it and leave the page showing through. */
        position: fixed;
        inset: 0;
        background: rgba(3, 6, 15, 0.82);
        -webkit-backdrop-filter: blur(9px);
        backdrop-filter: blur(9px);
    }

    .mh-panel {
        position: relative;
        width: 100%;
        max-width: 900px;
        max-height: 92vh;
        /* `margin: auto` rather than `align-items: center` on the parent: an
           overflowing flex item that is centre-aligned has its top clipped and
           becomes unreachable by scrolling. Auto margins centre it without
           that failure mode. */
        margin: auto;
        display: flex;
        flex-direction: column;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71, 85, 105, 0.22);
        border-radius: 20px;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        outline: none;
        animation: mh-in 160ms ease-out;
    }
    @keyframes mh-in {
        from { opacity: 0; transform: translateY(10px) scale(0.985); }
        to   { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
        .mh-panel { animation: none; }
    }

    /* ---- header strip ------------------------------------------------ */
    .mh-head {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 10px 9px 14px;
        border-bottom: 1px solid rgba(51, 65, 85, 0.2);
        background: rgba(148, 163, 184, 0.03);
    }
    .mh-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 10px var(--accent);
    }
    .mh-attr {
        flex: 0 0 auto;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.4px;
        color: var(--accent);
        white-space: nowrap;
    }
    .mh-abbr {
        flex: 0 0 auto;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 1px;
        color: #475569;
    }
    .mh-sep {
        flex: 0 0 auto;
        width: 1px;
        height: 14px;
        background: rgba(71, 85, 105, 0.35);
    }
    .mh-name {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 13px;
        font-weight: 800;
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .mh-tier {
        flex: 0 0 auto;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #64748b;
    }
    .mh-pips {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-right: 2px;
    }
    .mh-pip {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(100, 116, 139, 0.28);
    }
    .mh-pip.on {
        background: var(--accent);
        box-shadow: 0 0 6px var(--accent);
    }

    .mh-x {
        flex: 0 0 auto;
        width: 30px;
        height: 30px;
        border-radius: 10px;
        background: rgba(51, 65, 85, 0.3);
        border: 1px solid rgba(71, 85, 105, 0.2);
        color: #64748b;
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 140ms ease, color 140ms ease;
    }
    .mh-x:hover { background: rgba(239, 68, 68, 0.15); color: #f87171; }

    /* ---- stage ------------------------------------------------------- */
    .mh-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 14px;
        -webkit-overflow-scrolling: touch;
    }

    /* ---- unresolved drill -------------------------------------------- */
    .mh-miss {
        max-width: 460px;
        margin: 34px auto;
        text-align: center;
        padding: 30px 24px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.25);
        border-radius: 18px;
    }
    .mh-miss-ico { font-size: 32px; color: #fbbf24; margin-bottom: 10px; }
    .mh-miss-h { font-size: 18px; font-weight: 900; color: #e2e8f0; margin-bottom: 8px; }
    .mh-miss-p { font-size: 12px; line-height: 1.65; color: #64748b; }
    .mh-miss-meta {
        margin-top: 12px;
        font-size: 10px;
        line-height: 1.7;
        color: #475569;
        word-break: break-word;
    }
    .mh-miss-meta strong { color: #94a3b8; font-weight: 800; }
    .mh-miss-btn {
        margin-top: 18px;
        padding: 9px 20px;
        border-radius: 12px;
        border: 1px solid rgba(71, 85, 105, 0.3);
        background: rgba(51, 65, 85, 0.32);
        color: #cbd5e1;
        font-family: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
    }
    .mh-miss-btn:hover { background: rgba(71, 85, 105, 0.45); color: #e2e8f0; }

    /* ---- small screens ------------------------------------------------ */
    @media (max-width: 560px) {
        .mh-over { padding: 0; }
        .mh-panel { max-width: none; max-height: 100vh; height: 100vh; border-radius: 0; border: none; }
        .mh-attr, .mh-sep { display: none; }
        .mh-tier { display: none; }
        .mh-body { padding: 10px; }
    }

    /* On phones the address bar makes 100vh taller than what is actually
       visible, so the bottom of a drill sits under browser chrome. dvh tracks
       the visible viewport instead. */
    @supports (height: 100dvh) {
        .mh-panel { max-height: 92dvh; }
        @media (max-width: 560px) {
            .mh-panel { max-height: 100dvh; height: 100dvh; }
        }
    }
</style>
