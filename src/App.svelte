<script>
    import Header from './lib/components/layout/Header.svelte';
    import TabContent from './lib/components/layout/TabContent.svelte';
    import ToastContainer from './lib/components/layout/ToastContainer.svelte';
    import ConfirmModal from './lib/components/modals/ConfirmModal.svelte';
    import CardInspectModal from './lib/components/modals/CardInspectModal.svelte';
    import AuthPanel from './lib/components/modals/AuthPanel.svelte';
    import { activeTab } from './lib/stores/ui.js';
    import { initGame } from './lib/stores/game.js';

    initGame();
</script>

<div class="app-shell">
    <Header />
    <main>
        <TabContent tab={$activeTab} />
    </main>
</div>

<ToastContainer />
<ConfirmModal />
<CardInspectModal />
<AuthPanel />

<div class="version-badge">Beta 1.0.7 public build</div>

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
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }
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
