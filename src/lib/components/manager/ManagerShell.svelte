<script>
    // ═══════════════════════════════════════════════════════════════════
    //  LoL ULTIMATE MANAGER — mode shell
    // ═══════════════════════════════════════════════════════════════════
    //  Its own save (lurm_*), header and navigation, swapped in by App.svelte
    //  like CareerShell. The shared look of every manager screen (panels,
    //  buttons, chips, tables) is defined once here, scoped under .mgr.
    import { onDestroy } from 'svelte';
    import { openMenu } from '../../stores/menu.js';
    import { playSound } from '../../utils/sound.js';
    import { manager, mgrScreen, mgrMatch, mgrModal, mgrFx, initManager, flushManager, goNext } from '../../stores/manager.js';
    import { myTeam, currentStep, userFixture, blockInfo, nextOpponent, leagueName, fearlessOn, ownerStake, hasBoard } from '../../manager/engine.js';
    import { MGR_XP_PER_LEVEL } from '../../manager/data.js';
    import { fmtMoney, stageOf } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import NewManager from './NewManager.svelte';
    import Home from './Home.svelte';
    import Squad from './Squad.svelte';
    import Tactics from './Tactics.svelte';
    import League from './League.svelte';
    import Transfers from './Transfers.svelte';
    import Club from './Club.svelte';
    import Inbox from './Inbox.svelte';
    import Trophies from './Trophies.svelte';
    import Training from './Training.svelte';
    import History from './History.svelte';
    import MatchFlow from './MatchFlow.svelte';
    import PlayerModal from './PlayerModal.svelte';
    import TeamModal from './TeamModal.svelte';
    import StepReport from './StepReport.svelte';
    import OffseasonReport from './OffseasonReport.svelte';
    import StageFx from './StageFx.svelte';

    initManager();

    const autoSave = setInterval(() => flushManager(), 60 * 1000);
    onDestroy(() => { clearInterval(autoSave); flushManager(); });

    const SCREENS = [
        { id: 'home', name: 'Home', icon: 'home' },
        { id: 'squad', name: 'Squad', icon: 'squad' },
        { id: 'tactics', name: 'Tactics', icon: 'target' },
        { id: 'training', name: 'Training', icon: 'dumbbell' },
        { id: 'league', name: 'Competitions', icon: 'ranking' },
        { id: 'transfers', name: 'Transfers', icon: 'trade' },
        { id: 'history', name: 'History', icon: 'archive' },
        { id: 'trophies', name: 'Trophies', icon: 'trophy' },
        { id: 'club', name: 'Club', icon: 'briefcase' },
        { id: 'inbox', name: 'Inbox', icon: 'chat' },
    ];

    $: s = $manager;
    $: team = s ? myTeam(s) : null;
    $: step = s ? currentStep(s) : null;
    $: stage = s ? stageOf(s) : null;
    $: fixture = s ? userFixture(s) : null;
    $: opp = s ? nextOpponent(s) : null;
    $: unread = s ? s.inbox.filter(m => !m.read).length : 0;
    $: decisions = s ? s.inbox.filter(m => m.options && !m.answered).length : 0;
    $: offers = s ? (s.offers || []).length : 0;
    $: points = s ? s.manager.points || 0 : 0;
    $: conf = s ? Math.round(s.board.confidence) : 0;
    $: stake = s ? ownerStake(s) : 0;
    $: board = s ? hasBoard(s) : true;
    $: confColor = conf >= 60 ? '#34d399' : conf >= 35 ? '#fbbf24' : '#f87171';
    $: xpPct = s ? Math.min(100, (s.manager.xp / MGR_XP_PER_LEVEL) * 100) : 0;
    $: block = s ? blockInfo(s) : null;
    $: atHome = $mgrScreen === 'home';
    $: nextLabel = !s ? '' : s.jobless ? 'Choose a new club'
        : !atHome ? 'Back to Home'
        : block ? 'Needs you'
        : fixture ? `Play ${opp ? 'vs ' + opp.short : 'match'}`
        : step && step.kind === 'offseason' ? 'Start the offseason'
        : step && step.kind === 'window' ? (step.id === 'preseason' ? 'Start the Spring Split' : 'Start the Summer Split')
        : 'Continue';
    $: nextSub = !s ? '' : s.jobless ? 'Job offers are on the Club screen'
        : !atHome ? 'You continue from the club home'
        : block ? block.msg
        : fixture ? fixture.comp
        : step ? step.name + (step.kind === 'league' ? ' · bye week' : step.kind !== 'window' && step.kind !== 'offseason' ? ' · you are not playing' : '') : '';

    function go(id) {
        if ($mgrScreen === id) return;
        playSound('click');
        mgrScreen.set(id);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    function leave() {
        playSound('click');
        flushManager();
        openMenu();
    }

    let busy = false;
    function next() {
        if (!s || busy) return;
        playSound('click');
        if (s.jobless || !atHome || fixture || block) { goNext(); return; }
        busy = true;
        // Let the button repaint before the world is simulated.
        setTimeout(() => { try { goNext(); } finally { busy = false; } }, 20);
    }
</script>

<section class="mgr">
    {#if !s}
        <NewManager />
    {:else if $mgrMatch}
        <MatchFlow />
    {:else}
        <header class="mh" style="--team:{team ? team.color : '#64748b'}">
            <div class="mh-in">
                <button class="back" on:click={leave} title="Back to main menu" aria-label="Back to main menu">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
                </button>

                <div class="club">
                    <TeamBadge {team} size={42} />
                    <div class="club-t">
                        <span class="club-name">{team ? team.name : 'Between jobs'}</span>
                        <span class="club-sub">
                            {#if team}<RegionIcon region={team.region} size={12} />{leagueName(team.region, team.tier)}<span class="dot">·</span>{/if}
                            <span class="mgr-name">{s.manager.name}</span>
                        </span>
                    </div>
                </div>

                {#if stage}
                    <div class="stage" style="--sc:{stage.color}" title="{stage.name}: {stage.blurb}">
                        <span class="stage-ico"><Icon name={stage.icon} size={16} stroke={2.2} /></span>
                        <span class="stage-t">
                            <span class="stage-n">{stage.name}{#if fearlessOn(s)}<i class="fl" title="Fearless draft: a champion played in a series cannot be played again in it">Fearless</i>{/if}</span>
                            <span class="stage-s">{s.time.year} · {step ? step.name : ''}</span>
                        </span>
                    </div>
                {/if}

                <div class="stats">
                    <div class="st" title="Manager level {s.manager.level}: {s.manager.xp} of {MGR_XP_PER_LEVEL} XP">
                        <span class="st-l">Manager</span>
                        <span class="st-v">Lv {s.manager.level}{#if points}<i class="pts">+{points}</i>{/if}</span>
                        <span class="st-bar"><i style="width:{xpPct}%"></i></span>
                    </div>
                    <div class="st" title="Club balance">
                        <span class="st-l">Balance</span>
                        <span class="st-v" style="color:{s.finance.balance < 0 ? '#f87171' : '#f1f5f9'}">{fmtMoney(s.finance.balance)}</span>
                    </div>
                    {#if board}
                        <div class="st" title={stake ? `Board confidence. You own ${stake}% of the club${stake >= 50 ? ': they cannot sack you' : ''}.` : 'Board confidence: below 15% at the end of a season and you are sacked'}>
                            <span class="st-l">Board{stake ? ` · you ${stake}%` : ''}</span>
                            <span class="st-v" style="color:{confColor}">{conf}%</span>
                            <span class="st-bar"><i style="width:{conf}%; background:{confColor}"></i></span>
                        </div>
                    {:else}
                        <div class="st" title="You own the whole club: no board, no objectives, no wage limit">
                            <span class="st-l">Owner</span>
                            <span class="st-v" style="color:#fde68a">100%</span>
                            <span class="st-bar"><i style="width:100%; background:#fbbf24"></i></span>
                        </div>
                    {/if}
                </div>

                <button class="bell" class:hot={decisions > 0} class:has={unread > 0} on:click={() => go('inbox')} title={decisions ? `${decisions} decision${decisions === 1 ? '' : 's'} waiting` : unread ? `${unread} unread` : 'Inbox'} aria-label="Inbox, {unread} unread">
                    <Icon name="chat" size={19} stroke={2.1} />
                    {#if unread}<span class="bell-n">{unread}</span>{/if}
                </button>

                <button class="go" class:warn={atHome && !!block && !s.jobless} class:away={!atHome && !s.jobless} on:click={next} disabled={busy}>
                    <span class="go-t">{busy ? 'Simulating…' : nextLabel}</span>
                    <span class="go-s">{nextSub}</span>
                    <Icon name={!atHome ? 'home' : block ? 'alert' : fixture ? 'play' : 'arrow'} size={17} stroke={2.4} />
                </button>
            </div>

            <nav class="nav" aria-label="Manager sections">
                <div class="nav-in">
                    {#each SCREENS as sc}
                        <button class="tab" class:on={$mgrScreen === sc.id} on:click={() => go(sc.id)} aria-current={$mgrScreen === sc.id ? 'page' : undefined}>
                            <Icon name={sc.icon} size={16} stroke={2} />
                            <span class="tab-t">{sc.name}</span>
                            {#if sc.id === 'inbox' && unread}<span class="badge" class:badge-hot={decisions > 0}>{unread}</span>{/if}
                            {#if sc.id === 'transfers' && offers}<span class="badge">{offers}</span>{/if}
                            {#if sc.id === 'club' && points}<span class="badge badge-pt">+{points}</span>{/if}
                        </button>
                    {/each}
                </div>
            </nav>
        </header>

        <main class="mm">
            {#key $mgrScreen}
                <div class="screen">
                    {#if $mgrScreen === 'squad'}<Squad />
                    {:else if $mgrScreen === 'tactics'}<Tactics />
                    {:else if $mgrScreen === 'training'}<Training />
                    {:else if $mgrScreen === 'history'}<History />
                    {:else if $mgrScreen === 'league'}<League />
                    {:else if $mgrScreen === 'transfers'}<Transfers />
                    {:else if $mgrScreen === 'trophies'}<Trophies />
                    {:else if $mgrScreen === 'club'}<Club />
                    {:else if $mgrScreen === 'inbox'}<Inbox />
                    {:else}<Home on:next={next} {busy} />
                    {/if}
                </div>
            {/key}
        </main>
    {/if}

    {#if s && $mgrModal}
        {#if $mgrModal.kind === 'player'}{#key $mgrModal.id}<PlayerModal id={$mgrModal.id} />{/key}
        {:else if $mgrModal.kind === 'team'}{#key $mgrModal.id}<TeamModal id={$mgrModal.id} />{/key}
        {:else if $mgrModal.kind === 'step'}<StepReport summary={$mgrModal.summary} />
        {:else if $mgrModal.kind === 'offseason'}<OffseasonReport report={$mgrModal.report} summary={$mgrModal.summary || null} />
        {/if}
    {/if}

    {#if $mgrFx.length}
        {#key $mgrFx[0]}<StageFx card={$mgrFx[0]} />{/key}
    {/if}
</section>

<style>
    .mgr {
        --acc: #10b981;
        --line: rgba(71, 85, 105, 0.45);
        --card: rgba(15, 23, 42, 0.7);
        flex: 1 0 auto; display: flex; flex-direction: column; width: 100%; min-height: 100%;
        color: #d5deeb; font-size: 14px;
    }

    /* ═══════════ HEADER ═══════════ */
    .mh {
        position: sticky; top: 0; z-index: 40;
        background: linear-gradient(180deg, color-mix(in srgb, var(--team) 12%, rgba(6, 9, 17, 0.96)), rgba(6, 9, 17, 0.95));
        backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%);
        border-bottom: 1px solid rgba(71, 85, 105, 0.35);
    }
    .mh-in { max-width: 1500px; margin: 0 auto; display: flex; align-items: center; gap: 14px; padding: 11px 20px; }
    .back { flex-shrink: 0; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; color: #94a3b8; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(71, 85, 105, 0.4); cursor: pointer; }
    .back svg { width: 15px; height: 15px; }
    .back:hover { color: #fff; }
    .club { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .club-t { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .club-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px; }
    .club-sub { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #a5b4cf; white-space: nowrap; }
    .mgr-name { color: #6ee7b7; }
    .dot { color: #475569; }
    .stage { display: flex; align-items: center; gap: 10px; padding: 7px 13px 7px 8px; border-radius: 13px; min-width: 0; background: color-mix(in srgb, var(--sc) 12%, rgba(2, 6, 23, 0.6)); border: 1px solid color-mix(in srgb, var(--sc) 45%, transparent); }
    .stage-ico { width: 32px; height: 32px; flex-shrink: 0; display: grid; place-items: center; border-radius: 9px; color: #0b1120; background: var(--sc); box-shadow: 0 0 16px color-mix(in srgb, var(--sc) 45%, transparent); }
    .stage-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .stage-n { display: flex; align-items: center; gap: 7px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; }
    .stage-s { font-size: 11.5px; font-weight: 600; color: #a5b4cf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
    .fl { font-style: normal; font-size: 9.5px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; padding: 2px 6px; border-radius: 5px; color: #fff; background: linear-gradient(135deg, #ef4444, #f97316); }
    .stats { display: flex; align-items: stretch; gap: 8px; margin-left: auto; }
    .st { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 86px; padding: 6px 11px; border-radius: 10px; background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(71, 85, 105, 0.4); }
    .st-l { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #a5b4cf; }
    .st-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; font-weight: 800; color: #f1f5f9; white-space: nowrap; }
    .pts { font-style: normal; margin-left: 5px; font-size: 10px; padding: 1px 5px; border-radius: 5px; color: #052e1f; background: #34d399; }
    .st-bar { height: 3px; border-radius: 3px; background: rgba(148, 163, 184, 0.16); overflow: hidden; }
    .st-bar i { display: block; height: 100%; background: #34d399; border-radius: 3px; }
    .bell { position: relative; flex-shrink: 0; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 13px; cursor: pointer; color: #a5b4cf; background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(71, 85, 105, 0.45); }
    .bell:hover { color: #fff; }
    .bell.has { color: #fde68a; border-color: rgba(251, 191, 36, 0.55); }
    .bell.hot { color: #fff; background: rgba(244, 114, 182, 0.18); border-color: #f472b6; animation: ring 1.6s ease-in-out infinite; }
    @keyframes ring { 0%, 100% { box-shadow: 0 0 0 0 rgba(244, 114, 182, 0.45); } 50% { box-shadow: 0 0 0 7px rgba(244, 114, 182, 0); } }
    .bell-n { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; display: grid; place-items: center; border-radius: 999px; font-size: 11px; font-weight: 900; color: #0b1120; background: #fbbf24; border: 2px solid #060911; }
    .bell.hot .bell-n { background: #f472b6; color: #fff; }
    .go {
        flex-shrink: 0; display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: 12px; align-items: center;
        padding: 9px 16px; border-radius: 13px; border: none; cursor: pointer; text-align: left; font-family: inherit;
        color: #022c1c; background: linear-gradient(135deg, #34d399, #10b981);
        box-shadow: 0 8px 22px rgba(16, 185, 129, 0.28);
    }
    .go.warn { color: #3b1d00; background: linear-gradient(135deg, #fcd34d, #f59e0b); box-shadow: 0 8px 22px rgba(245, 158, 11, 0.3); }
    .go.away { color: #e2e8f0; background: rgba(30, 41, 59, 0.9); box-shadow: none; border: 1px solid rgba(100, 116, 139, 0.5); }
    .go:hover:not(:disabled) { filter: brightness(1.08); }
    .go:disabled { opacity: 0.7; cursor: progress; }
    .go-t { grid-column: 1; font-size: 14.5px; font-weight: 900; white-space: nowrap; }
    .go-s { grid-column: 1; grid-row: 2; font-size: 11px; font-weight: 700; opacity: 0.8; white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
    .go :global(.ico) { grid-column: 2; grid-row: 1 / span 2; }

    .nav { border-top: 1px solid rgba(71, 85, 105, 0.22); }
    .nav-in { max-width: 1500px; margin: 0 auto; display: flex; gap: 3px; padding: 6px 20px; overflow-x: auto; scrollbar-width: none; }
    .nav-in::-webkit-scrollbar { display: none; }
    .tab { position: relative; display: flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 10px; border: 1px solid transparent; background: transparent; font-family: inherit; font-size: 13.5px; font-weight: 700; color: #a5b4cf; cursor: pointer; white-space: nowrap; }
    .tab:hover { color: #fff; background: rgba(51, 65, 85, 0.35); }
    .tab.on { color: #6ee7b7; background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.4); }
    .badge { min-width: 18px; height: 18px; padding: 0 5px; display: inline-grid; place-items: center; border-radius: 999px; font-size: 10.5px; font-weight: 900; color: #0b1120; background: #fbbf24; }
    .badge-hot { color: #fff; background: #f472b6; }
    .badge-pt { background: #34d399; }

    .mm { flex: 1; width: 100%; max-width: 1500px; margin: 0 auto; padding: 22px 20px 60px; }
    .screen { animation: mFade 0.25s ease both; }
    @keyframes mFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    @media (max-width: 1200px) {
        .mh-in { flex-wrap: wrap; }
        .stage { order: 3; }
        .stats { order: 4; flex: 1 1 auto; margin-left: 0; }
        .bell { margin-left: auto; }
    }
    @media (max-width: 760px) {
        .stage { flex: 1 1 100%; }
        .stats { flex: 1 1 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .st { min-width: 0; }
    }
    @media (max-width: 620px) {
        .mh-in { padding: 10px 14px; gap: 10px; }
        .club-name { max-width: 150px; font-size: 15px; }
        .go { order: 5; width: 100%; grid-template-columns: 1fr auto; }
        .go-s { max-width: none; }
        .tab-t { display: none; }
        .mm { padding: 16px 14px 48px; }
    }

    /* ═══════════ SHARED (every manager screen) ═══════════ */
    .mgr :global(.panel) { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; min-width: 0; }
    .mgr :global(.ph) { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .mgr :global(.ph h3) { display: flex; align-items: center; gap: 8px; margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #c3cfe2; }
    .mgr :global(.ph h3 .ico) { color: #34d399; }
    .mgr :global(.page-h) { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 26px; font-weight: 700; letter-spacing: -0.01em; color: #fff; margin: 0 0 4px; }
    .mgr :global(.page-sub) { font-size: 14px; color: #a5b4cf; margin: 0 0 18px; line-height: 1.6; }
    .mgr :global(.btn) { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 14px; border-radius: 11px; font-family: inherit; font-size: 13px; font-weight: 700; color: #cbd5e1; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(71, 85, 105, 0.5); cursor: pointer; white-space: nowrap; }
    .mgr :global(.btn:hover:not(:disabled)) { color: #fff; border-color: rgba(52, 211, 153, 0.55); }
    .mgr :global(.btn:disabled) { opacity: 0.45; cursor: not-allowed; }
    .mgr :global(.btn-p) { color: #022c1c; background: linear-gradient(135deg, #34d399, #10b981); border-color: transparent; }
    .mgr :global(.btn-p:hover:not(:disabled)) { color: #022c1c; filter: brightness(1.08); }
    .mgr :global(.btn-sm) { padding: 6px 10px; font-size: 12px; border-radius: 9px; }
    .mgr :global(.btn-danger) { color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); }
    .mgr :global(.btn-danger:hover:not(:disabled)) { color: #fff; border-color: #ef4444; background: rgba(127, 29, 29, 0.35); }
    .mgr :global(.chip) { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: var(--c, #94a3b8); background: color-mix(in srgb, var(--c, #94a3b8) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c, #94a3b8) 32%, transparent); white-space: nowrap; }
    .mgr :global(.ovr) { display: inline-grid; place-items: center; min-width: 30px; height: 24px; padding: 0 5px; border-radius: 7px; font-weight: 900; font-size: 12.5px; color: var(--c, #e2e8f0); background: color-mix(in srgb, var(--c, #94a3b8) 13%, rgba(2, 6, 23, 0.6)); border: 1px solid color-mix(in srgb, var(--c, #94a3b8) 42%, transparent); font-variant-numeric: tabular-nums; }
    .mgr :global(.tbl-wrap) { width: 100%; overflow-x: auto; }
    .mgr :global(.tbl) { width: 100%; border-collapse: collapse; font-size: 13px; }
    .mgr :global(.tbl th) { text-align: left; font-size: 10.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #8aa0c4; padding: 7px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
    .mgr :global(.tbl td) { padding: 9px 8px; border-bottom: 1px solid rgba(51, 65, 85, 0.25); color: #dbe4f0; vertical-align: middle; }
    .mgr :global(.tbl tr.me td) { background: rgba(16, 185, 129, 0.09); }
    .mgr :global(.tbl tr.click) { cursor: pointer; }
    .mgr :global(.tbl tr.click:hover td) { background: rgba(51, 65, 85, 0.25); }
    .mgr :global(.tbl .r) { text-align: right; }
    .mgr :global(.tbl .c) { text-align: center; }
    .mgr :global(.num) { font-variant-numeric: tabular-nums; }
    .mgr :global(.muted) { color: #8193ad; }
    .mgr :global(.dim) { color: #a5b4cf; }
    .mgr :global(.good) { color: #34d399; }
    .mgr :global(.bad) { color: #f87171; }
    .mgr :global(.warn) { color: #fbbf24; }
    .mgr :global(.bar) { height: 6px; border-radius: 6px; background: rgba(148, 163, 184, 0.14); overflow: hidden; }
    .mgr :global(.bar > i) { display: block; height: 100%; border-radius: 6px; background: var(--c, #10b981); }
    .mgr :global(.seg) { display: inline-flex; padding: 3px; gap: 2px; border-radius: 11px; background: rgba(2, 6, 23, 0.55); border: 1px solid var(--line); flex-wrap: wrap; }
    .mgr :global(.seg button) { padding: 6px 12px; border-radius: 8px; border: none; background: transparent; font-family: inherit; font-size: 12px; font-weight: 700; color: #94a3b8; cursor: pointer; white-space: nowrap; }
    .mgr :global(.seg button.on) { color: #022c1c; background: #34d399; }
    .mgr :global(.seg button:hover:not(.on)) { color: #e2e8f0; }
    .mgr :global(.empty) { text-align: center; color: #64748b; padding: 18px; font-size: 13px; }
    .mgr :global(.sel) { padding: 7px 10px; border-radius: 9px; font-family: inherit; font-size: 12.5px; font-weight: 600; color: #e2e8f0; background: rgba(2, 6, 23, 0.7); border: 1px solid rgba(71, 85, 105, 0.55); }
    .mgr :global(.sel:focus), .mgr :global(.inp:focus) { outline: none; border-color: #34d399; }
    .mgr :global(.inp) { padding: 8px 11px; border-radius: 9px; font-family: inherit; font-size: 13px; color: #e2e8f0; background: rgba(2, 6, 23, 0.7); border: 1px solid rgba(71, 85, 105, 0.55); }
    .mgr :global(.role-ico) { width: 16px; height: 16px; vertical-align: middle; opacity: 0.85; }
    .mgr :global(.modal-back) { position: fixed; inset: 0; z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; background: rgba(2, 6, 23, 0.78); backdrop-filter: blur(4px); }
    .mgr :global(.modal) { position: relative; width: 100%; max-width: 860px; border-radius: 20px; background: #0b1222; border: 1px solid rgba(71, 85, 105, 0.5); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); padding: 22px; animation: mPop 0.22s ease both; }
    .mgr :global(.modal-x) { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; color: #94a3b8; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--line); cursor: pointer; }
    .mgr :global(.modal-x:hover) { color: #fff; }
    @keyframes mPop { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
</style>
