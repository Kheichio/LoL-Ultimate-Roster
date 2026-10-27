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
    import Icon from '../../ui/Icon.svelte';
    import { guideFor, SCORE_NOTE } from './guides.js';
    import { saveToStorage, loadFromStorage } from '../../../utils/storage.js';

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
    $: if (runKey !== prevKey) { prevKey = runKey; lastQuitAt = 0; lastDoneAt = 0; resetBriefing(); }

    // ---------------------------------------------------------------- briefing
    //  Every drill opens on the same card: the goal, three steps, the controls
    //  and what a normal score is (guides.js). Then a short 3-2-1 and the game
    //  mounts with `briefed`, which makes it skip its own intro screen, so the
    //  instructions are read once, in one place, in one format.
    $: guide = guideFor(gameId);
    let briefing = true;
    let countdown = 0;
    let cdTimer = null;
    const reducedMotion = typeof window !== 'undefined' && !!(window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // A drill this device has already started opens on a SHORT card: the goal
    // and the controls, with the steps one click away. Reading the same three
    // steps before every session is most of what made training feel slow.
    // A device preference (storage.js DEVICE_KEYS), not save data.
    const SEEN_KEY = 'lur_drill_briefs';
    const COUNT_MS = 300;
    let compact = false;
    let showSteps = false;
    function seenBriefs() {
        const v = loadFromStorage(SEEN_KEY);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }
    function markSeen(id) {
        if (!id) return;
        const seen = seenBriefs();
        if (seen[id]) return;
        saveToStorage(SEEN_KEY, { ...seen, [id]: 1 });
    }

    function resetBriefing() {
        if (cdTimer) { clearTimeout(cdTimer); cdTimer = null; }
        briefing = true;
        countdown = 0;
        compact = !!(gameId && seenBriefs()[gameId]);
        showSteps = false;
    }

    function begin() {
        if (!briefing || countdown) return;
        markSeen(gameId);
        if (reducedMotion) { briefing = false; return; }
        countdown = 3;
        const stepDown = () => {
            countdown -= 1;
            if (countdown <= 0) { cdTimer = null; briefing = false; return; }
            cdTimer = setTimeout(stepDown, COUNT_MS);
        };
        cdTimer = setTimeout(stepDown, COUNT_MS);
    }

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
        // On the briefing card, Enter or Space starts the drill. The game is not
        // mounted yet, so nothing else can be listening for the key.
        if (briefing && Cmp && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
            const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
            if (tag !== 'BUTTON' || e.target.classList.contains('mb-go')) {
                e.preventDefault();
                begin();
                return;
            }
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
        if (cdTimer) { clearTimeout(cdTimer); cdTimer = null; }
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
            {#if Cmp && briefing}
                <!-- ===== THE BRIEFING ===== -->
                <!-- A drill already played on this device opens compact: the steps
                     and the score note are hidden with CSS (still rendered, so
                     careerRender's SSR pass keeps covering them) behind "How to play". -->
                <div class="mb" class:mb-compact={compact && !showSteps} style="--accent:{accent}">
                    <div class="mb-top">
                        <span class="mb-ico"><Icon name={(guide && guide.icon) || 'target'} size={26} stroke={2} /></span>
                        <div class="mb-titles">
                            <span class="mb-k">{attrName} drill &middot; {tierName}</span>
                            <h2 class="mb-h">{drillName}</h2>
                        </div>
                        {#if compact}
                            <button class="mb-howto" type="button" on:click={() => { showSteps = !showSteps; }} aria-expanded={showSteps}>
                                {showSteps ? 'Hide steps' : 'How to play'}
                            </button>
                        {/if}
                    </div>

                    {#if guide}
                        <p class="mb-goal">Your goal: <b>{guide.goal}</b>.</p>
                        <ol class="mb-steps">
                            {#each guide.steps as s, i}
                                <li><span class="mb-n">{i + 1}</span><span class="mb-s">{s}</span></li>
                            {/each}
                        </ol>
                        <div class="mb-keys" aria-label="Controls">
                            {#each guide.controls as c}
                                <span class="mb-key"><kbd>{c[0]}</kbd> {c[1]}</span>
                            {/each}
                        </div>
                    {/if}

                    <p class="mb-score"><Icon name="star" size={13} stroke={2.2} /> {SCORE_NOTE}</p>

                    <div class="mb-actions">
                        <button class="mb-back" type="button" on:click={quit}>Back</button>
                        <button class="mb-go" type="button" on:click={begin} disabled={countdown > 0}>
                            {#if countdown > 0}Starting in {countdown}{:else}Start drill <Icon name="play" size={13} stroke={2.4} />{/if}
                        </button>
                    </div>
                    <p class="mb-hint">Enter or Space to start &middot; Esc to leave</p>

                    {#if countdown > 0}
                        <div class="mb-count" aria-live="assertive">{#key countdown}<span class="mb-count-n">{countdown}</span>{/key}</div>
                    {/if}
                </div>
            {:else if Cmp}
                {#key runKey}
                    <svelte:component
                        this={Cmp}
                        difficulty={level}
                        {drill}
                        briefed={true}
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

    /* ---- briefing ---------------------------------------------------- */
    .mb {
        position: relative;
        max-width: 620px;
        margin: 10px auto 6px;
        padding: 24px;
        border-radius: 18px;
        background:
            radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
            rgba(12, 16, 28, 0.6);
        border: 1px solid color-mix(in srgb, var(--accent) 28%, rgba(51, 65, 85, 0.3));
    }
    .mb-top { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .mb-howto {
        flex-shrink: 0; padding: 7px 12px; border-radius: 10px; cursor: pointer;
        font-family: inherit; font-size: 11.5px; font-weight: 800;
        color: #cbd5e1; background: rgba(51, 65, 85, 0.35); border: 1px solid rgba(100, 116, 139, 0.4);
    }
    .mb-howto:hover { color: #f1f5f9; border-color: var(--accent); }
    .mb-compact .mb-steps, .mb-compact .mb-score { display: none; }
    .mb-compact { padding-top: 20px; padding-bottom: 20px; }
    .mb-ico {
        flex-shrink: 0; width: 50px; height: 50px; border-radius: 14px;
        display: grid; place-items: center;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    }
    .mb-titles { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .mb-k { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--accent); }
    .mb-h { margin: 0; font-size: 21px; font-weight: 900; color: #f1f5f9; letter-spacing: -0.01em; }
    .mb-goal { margin: 0 0 14px; font-size: 14px; line-height: 1.55; color: #cbd5e1; }
    .mb-goal b { color: #f8fafc; }
    .mb-steps { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .mb-steps li {
        display: flex; align-items: flex-start; gap: 11px;
        padding: 10px 12px; border-radius: 11px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.3);
    }
    .mb-n {
        flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 11px; font-weight: 900; color: #0b1120; background: var(--accent);
    }
    .mb-s { font-size: 12.5px; line-height: 1.55; color: #cbd5e1; }
    .mb-keys { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 12px; }
    .mb-key { font-size: 11.5px; color: #94a3b8; }
    .mb-key kbd {
        display: inline-block; padding: 2px 7px; margin-right: 3px; border-radius: 6px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10.5px; font-weight: 800;
        color: #e2e8f0; background: rgba(51, 65, 85, 0.55); border: 1px solid rgba(100, 116, 139, 0.45);
        border-bottom-width: 2px;
    }
    .mb-score {
        display: flex; align-items: flex-start; gap: 7px;
        margin: 0 0 18px; padding: 9px 11px; border-radius: 10px;
        font-size: 11.5px; line-height: 1.5; color: #fde68a;
        background: rgba(234, 179, 8, 0.07); border: 1px solid rgba(234, 179, 8, 0.22);
    }
    .mb-actions { display: flex; gap: 10px; }
    .mb-back, .mb-go {
        padding: 12px 18px; border-radius: 12px; cursor: pointer;
        font-family: inherit; font-size: 13px; font-weight: 800;
    }
    .mb-back { color: #94a3b8; background: rgba(51, 65, 85, 0.35); border: 1px solid rgba(71, 85, 105, 0.35); }
    .mb-back:hover { color: #e2e8f0; }
    .mb-go {
        flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        color: #0b1120; border: none;
        background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 80%, #fff 20%), var(--accent));
        box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 30%, transparent);
    }
    .mb-go:hover:not(:disabled) { filter: brightness(1.07); }
    .mb-go:disabled { cursor: default; opacity: 0.85; }
    .mb-hint { margin: 10px 0 0; text-align: center; font-size: 10.5px; color: #475569; }
    .mb-count {
        position: absolute; inset: 0; border-radius: 18px;
        display: grid; place-items: center;
        background: rgba(5, 8, 18, 0.72);
        -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
    }
    .mb-count-n {
        font-size: 96px; font-weight: 900; line-height: 1; color: var(--accent);
        text-shadow: 0 0 40px color-mix(in srgb, var(--accent) 60%, transparent);
        animation: mb-pop 300ms ease-out both;
    }
    @keyframes mb-pop {
        from { transform: scale(1.5); opacity: 0; }
        40%  { opacity: 1; }
        to   { transform: scale(0.9); opacity: 0.85; }
    }
    @media (max-width: 560px) {
        .mb { padding: 16px; margin-top: 0; }
        .mb-h { font-size: 18px; }
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
