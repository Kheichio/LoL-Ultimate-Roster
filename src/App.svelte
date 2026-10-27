<script>
    import Header from './lib/components/layout/Header.svelte';
    import TabContent from './lib/components/layout/TabContent.svelte';
    import ToastContainer from './lib/components/layout/ToastContainer.svelte';
    import MainMenu from './lib/components/layout/MainMenu.svelte';
    import CareerShell from './lib/components/career/CareerShell.svelte';
    import ManagerShell from './lib/components/manager/ManagerShell.svelte';
    import ConfirmModal from './lib/components/modals/ConfirmModal.svelte';
    import CardInspectModal from './lib/components/modals/CardInspectModal.svelte';
    import AuthPanel from './lib/components/modals/AuthPanel.svelte';
    import { activeTab } from './lib/stores/ui.js';
    import { menuScreen } from './lib/stores/menu.js';
    import { initGame, saveGame, checkMilestoneCards } from './lib/stores/game.js';
    import { currentUser, cloudSave } from './lib/stores/auth.js';
    import { startLeaderboardSync } from './lib/stores/leaderboard.js';
    import { get } from 'svelte/store';
    import { onDestroy } from 'svelte';

    initGame();
    setTimeout(() => { checkMilestoneCards(); }, 500);

    // The Ranking board publishes itself whenever the club changes (stores/leaderboard.js),
    // so this timer is only the periodic cloud backup.
    startLeaderboardSync();

    async function globalAutoSave() {
        saveGame();
        if (!get(currentUser) || !window.fbDb) return;
        try { await cloudSave(); } catch(e) {}
    }

    const autoSaveInterval = setInterval(globalAutoSave, 10 * 60 * 1000);
    onDestroy(() => clearInterval(autoSaveInterval));
</script>

<!-- The game shell stays mounted behind the main menu (rather than being torn down and
     rebuilt) so returning to the menu mid-session never loses in-progress tab state. -->
<div class="app-shell" class:shell-hidden={$menuScreen !== 'game'}>
    <Header />
    <main>
        <TabContent tab={$activeTab} />
    </main>
</div>

<!-- Ultimate Career is a separate shell, not a tab: it has its own header, its
     own save file (lurc_*) and its own navigation, so it replaces the menu
     entirely rather than sitting inside the roster game. -->
{#if $menuScreen === 'career'}
    <CareerShell />
{:else if $menuScreen === 'manager'}
    <ManagerShell />
{:else if $menuScreen !== 'game'}
    <MainMenu />
{/if}

<ToastContainer />
<ConfirmModal />
<CardInspectModal />
<AuthPanel />

{#if $menuScreen === 'game'}
    <div class="version-badge">Beta 1.8.10 Public Build</div>
{/if}

<style>
    .version-badge {
        position: fixed;
        bottom: 12px;
        right: 16px;
        font-size: 9px;
        font-weight: 700;
        color: #334155;
        letter-spacing: 0.5px;
        z-index: 10;
        pointer-events: none;
        user-select: none;
    }
    .app-shell {
        flex: 1 0 auto;
        display: flex;
        flex-direction: column;
    }
    .shell-hidden { display: none; }
    main {
        flex: 1;
        padding: 20px 24px;
        max-width: 1600px;
        width: 100%;
        margin: 0 auto;
    }
    @media (max-width: 768px) {
        main { padding: 12px; }
    }
    @media (min-width: 1800px) {
        main { max-width: 1700px; }
    }
</style>
