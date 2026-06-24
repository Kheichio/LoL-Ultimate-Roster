<script>
    import { toasts } from '../../stores/toasts.js';
</script>

<div class="toast-container">
    {#each $toasts as toast (toast.id)}
        <div class="toast toast-{toast.type}">
            <span class="toast-icon">
                {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ'}
            </span>
            <span class="toast-msg">{toast.message}</span>
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        max-width: 380px;
    }
    .toast {
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        animation: toastSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        backdrop-filter: blur(12px);
        border: 1px solid;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .toast-info {
        background: rgba(15, 23, 42, 0.9);
        border-color: rgba(71, 85, 105, 0.4);
        color: #e2e8f0;
    }
    .toast-success {
        background: rgba(6, 78, 59, 0.9);
        border-color: rgba(16, 185, 129, 0.3);
        color: #a7f3d0;
    }
    .toast-error {
        background: rgba(127, 29, 29, 0.9);
        border-color: rgba(239, 68, 68, 0.3);
        color: #fecaca;
    }
    .toast-icon {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 900;
        flex-shrink: 0;
    }
    .toast-success .toast-icon { background: rgba(16,185,129,0.25); color: #34d399; }
    .toast-error .toast-icon { background: rgba(239,68,68,0.25); color: #f87171; }
    .toast-info .toast-icon { background: rgba(59,130,246,0.2); color: #60a5fa; }
    .toast-msg { flex: 1; }

    @media (max-width: 768px) {
        .toast-container { left: 12px; right: 12px; max-width: none; }
    }
</style>
