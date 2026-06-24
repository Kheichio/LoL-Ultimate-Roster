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
<div class="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm p-4" on:click|self={closeConfirmModal}>
    <div class="glass max-w-sm w-full p-6 rounded-2xl border border-slate-700/40 text-center" style="box-shadow: 0 25px 60px rgba(0,0,0,0.5);">
        <div class="text-3xl mb-3">⚠️</div>
        <h3 class="text-lg font-black text-slate-100 mb-1.5">Are you sure?</h3>
        <p class="text-sm text-slate-400 mb-5">{$confirmModalState.message}</p>
        <div class="flex gap-3">
            <button class="btn-secondary flex-1" on:click={closeConfirmModal}>Cancel</button>
            <button class="btn-danger flex-1 text-sm" on:click={handleConfirm}>Confirm</button>
        </div>
    </div>
</div>
{/if}
