import { writable, derived } from 'svelte/store';
import { loadFromStorage } from '../utils/storage.js';

const hasPlayed = loadFromStorage('lur_starter');
export const activeTab = writable(hasPlayed ? 'home' : 'welcome');
// The Settings panel (modals/AuthPanel.svelte — it grew out of the account panel and still
// owns sign-in). `settingsSection` is the page it opens on; open it through openSettings().
export const showAuthPanel = writable(false);
export const SETTINGS_SECTIONS = ['account', 'display', 'sound', 'codes', 'data'];
export const settingsSection = writable('account');
export function openSettings(section = 'display') {
    settingsSection.set(SETTINGS_SECTIONS.includes(section) ? section : 'display');
    showAuthPanel.set(true);
}
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

// Match screens: show each lineup as the real cards (true, the default) or as compact player
// rows (false). A device preference like the theme — listed in storage.js DEVICE_KEYS so a
// save-slot switch never resets it.
export const matchCardView = writable(localStorage.getItem('lur_match_cards') !== '0');
matchCardView.subscribe(v => {
    try { localStorage.setItem('lur_match_cards', v ? '1' : '0'); } catch (e) { /* private mode */ }
});

// Real player photos on cards (data/playerPictures.js). OFF unless the player turns it on:
// only a few dozen cards have a photo so far, and a collection where most cards show
// initials and a handful show a face looks unfinished. A device preference like the theme.
export const playerPhotos = writable(localStorage.getItem('lur_player_photos') === '1');
playerPhotos.subscribe(v => {
    try { localStorage.setItem('lur_player_photos', v ? '1' : '0'); } catch (e) { /* private mode */ }
});

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

// Set by the Friends tab to hand a friend's squad to the Tournament tab's Rival Challenge flow.
export const pendingChallenge = writable(null);

export function switchTab(tab) {
    activeTab.set(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
