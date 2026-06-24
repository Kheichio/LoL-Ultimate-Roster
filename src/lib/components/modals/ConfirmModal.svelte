<script>
    import { confirmModalState, closeConfirmModal } from '../../stores/ui.js';

    function handleConfirm() {
        if ($confirmModalState.onConfirm) $confirmModalState.onConfirm();
        closeConfirmModal();
    }
</script>

{#if $confirmModalState.open}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="confirm-overlay" on:click|self={closeConfirmModal}>
    <div class="confirm-box">
        <div class="confirm-icon">⚠️</div>
        <h3 class="confirm-title">Are you sure?</h3>
        <p class="confirm-msg">{$confirmModalState.message}</p>
        <div class="confirm-btns">
            <button class="btn-secondary" style="flex:1;" on:click={closeConfirmModal}>Cancel</button>
            <button class="btn-danger" style="flex:1;" on:click={handleConfirm}>Confirm</button>
        </div>
    </div>
</div>
{/if}

<style>
    .confirm-overlay {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .confirm-box {
        max-width: 380px; width: 100%; padding: 28px;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71,85,105,0.25); border-radius: 20px;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0,0,0,0.6);
    }
    .confirm-icon { font-size: 32px; margin-bottom: 12px; }
    .confirm-title { font-size: 18px; font-weight: 900; color: #e2e8f0; margin-bottom: 6px; }
    .confirm-msg { font-size: 13px; color: #64748b; margin-bottom: 24px; line-height: 1.5; }
    .confirm-btns { display: flex; gap: 10px; }
</style>
