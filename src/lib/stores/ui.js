import { writable, derived } from 'svelte/store';
import { loadFromStorage } from '../utils/storage.js';

const hasPlayed = loadFromStorage('lur_starter');
export const activeTab = writable(hasPlayed ? 'home' : 'welcome');
export const showAuthPanel = writable(false);
export const confirmModalState = writable({ open: false, message: 'This action cannot be undone.', onConfirm: null });
export const showConfirmModal = {
    subscribe: derived(confirmModalState, $s => $s.open).subscribe,
    set(val) {
        if (!val) confirmModalState.set({ open: false, message: '', onConfirm: null });
    }
};

export function openConfirmModal(message, onConfirm) {
    confirmModalState.set({ open: true, message, onConfirm });
}

export function closeConfirmModal() {
    confirmModalState.set({ open: false, message: '', onConfirm: null });
}
export const inspectingCard = writable(null);
export const soundMuted = writable(localStorage.getItem('lur_sound_muted') === '1');
export const displayScale = writable(localStorage.getItem('lur_display_scale') || 'auto');
export const lightMode = writable(localStorage.getItem('lur_light_mode') === '1');

export function toggleLightMode() {
    lightMode.update(v => {
        const next = !v;
        localStorage.setItem('lur_light_mode', next ? '1' : '0');
        document.documentElement.classList.toggle('light-mode', next);
        return next;
    });
}

// Init on load
if (localStorage.getItem('lur_light_mode') === '1') {
    document.documentElement.classList.add('light-mode');
}

export const splitCooldownEnd = writable(0);

export function switchTab(tab) {
    activeTab.set(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
