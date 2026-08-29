import { writable, get } from 'svelte/store';
import { activeSlot } from '../utils/storage.js';

// === Main Menu / Gamemode shell ===
// The main menu is deliberately NOT persisted: it opens on every page load, in front of
// whatever tab the save restores. Only the gamemode choice lives here — the rest of the
// game state is untouched by it.
//
//   'menu'    → the main menu (title, login, gamemode buttons)
//   'slots'   → the save slot picker for the gamemode just chosen
//   'loading' → the gamemode loading screen animation
//   'updates' → the changelog. It describes the whole product, not one gamemode,
//               so it sits out here where it can be read without loading a save.
//   'game'    → Ultimate Roster (App renders the normal Header + TabContent shell)
//   'career'  → Ultimate Career (App renders CareerShell instead)
export const menuScreen = writable('menu');

// 'roster' | 'career' | null — which gamemode the player picked.
export const selectedMode = writable(null);

// ─────────────────────────────────────────────────────────────────────────
//  BOOT INTENT
//  Switching the ACTIVE ROSTER SLOT at runtime is not safe: initGame() runs
//  once at App init and merges rather than resets, the roster shell is
//  deliberately never unmounted, and Header/AuthPanel read their storage once
//  at mount. So a roster slot change reloads the page — and this is how the
//  player lands back where they were going instead of at the title screen.
//
//  sessionStorage, not localStorage: an intent that outlived the tab would drag
//  the player straight into a gamemode on some unrelated visit later.
// ─────────────────────────────────────────────────────────────────────────
const BOOT_KEY = 'lurmeta_boot_intent';

export function setBootIntent(modeId) {
    try { sessionStorage.setItem(BOOT_KEY, String(modeId || '')); } catch (e) { /* ignore */ }
}

/** Read and CLEAR the pending intent. Reading it twice must never re-enter. */
export function takeBootIntent() {
    let v = null;
    try {
        v = sessionStorage.getItem(BOOT_KEY);
        sessionStorage.removeItem(BOOT_KEY);
    } catch (e) { return null; }
    return v === 'roster' || v === 'career' ? v : null;
}

/** Which slot each gamemode is currently pointed at. */
export function currentSlot(modeId) {
    return activeSlot(modeId === 'career' ? 'career' : 'roster');
}

export const GAMEMODES = [
    {
        id: 'roster',
        name: 'Ultimate Roster',
        tagline: 'Collect · Build · Conquer',
        desc: 'Open packs, chase signatures and legacy cards, and build the strongest five in the world — from the Gaming Cafe to the World Championship.',
        accent: '#3b82f6',
        available: true,
    },
    {
        id: 'career',
        name: 'Ultimate Career',
        // Career mode is a PLAYER career, not a manager one: you create a pro and live
        // their whole career, rather than running an org from the outside.
        tagline: 'Create · Train · Ascend',
        desc: 'Create a pro player from nothing. Pick a role and a region, grind out of the academy, earn your starting spot, and chase a Hall of Legends career.',
        accent: '#8b5cf6',
        available: true,
    },
];

// "More games by us" — other Studio8Heads titles, linked from the main menu.
// Add another entry here and the section grows on its own.
export const MORE_GAMES = [
    {
        id: 'gacha-survivors',
        name: 'Gacha Survivors',
        blurb: 'An anime-inspired roguelike survivors game with gacha pulls for characters.',
        // The deployed host has a typo in it ("suvivors"). It's the URL that actually
        // resolves, so it stays exactly as-is — it just isn't shown anywhere in the UI.
        href: 'https://gacha-suvivors.vercel.app',
    },
];

// Shown on the Ultimate Career preview screen.
export const CAREER_PILLARS = [
    { key: 'create', name: 'Create Your Player', desc: 'Handle, role, region and playstyle. You start as an unranked academy prospect nobody has heard of.' },
    { key: 'train', name: 'Train & Develop', desc: 'Grind individual stats between matches. Form and confidence swing with every result, good or bad.' },
    { key: 'earn', name: 'Earn The Starting Spot', desc: 'Beat your own teammates to the seat, get scouted, negotiate contracts — or get benched and traded.' },
    { key: 'legacy', name: 'Build A Legacy', desc: 'All-Pro selections, split MVPs, Worlds titles, and a retirement that ends in the Hall of Legends.' },
];

export function openMenu() {
    selectedMode.set(null);
    menuScreen.set('menu');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

/** Straight back to the slot picker for the mode just left. */
export function openSlots(modeId) {
    selectedMode.set(modeId);
    menuScreen.set('slots');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

// ─────────────────────────────────────────────────────────────────────────
//  UPDATE LOG
//  Reachable from the title screen AND from the Home page inside Ultimate
//  Roster, so Back has to know which one it came from: sending a player who was
//  mid-session back to the title screen instead of to their game would read as
//  the app dropping them. The roster shell stays mounted the whole time (App
//  only hides it), so returning to 'game' costs nothing and loses no tab state.
// ─────────────────────────────────────────────────────────────────────────
export const updatesReturn = writable('menu');

export function openUpdates(from = 'menu') {
    updatesReturn.set(from === 'game' ? 'game' : 'menu');
    menuScreen.set('updates');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

export function closeUpdates() {
    menuScreen.set(get(updatesReturn) === 'game' ? 'game' : 'menu');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}
