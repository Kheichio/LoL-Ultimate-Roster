import { writable } from 'svelte/store';

// === Main Menu / Gamemode shell ===
// The main menu is deliberately NOT persisted: it opens on every page load, in front of
// whatever tab the save restores. Only the gamemode choice lives here — the rest of the
// game state is untouched by it.
//
//   'menu'    → the main menu (title, login, gamemode buttons)
//   'loading' → the gamemode loading screen animation
//   'game'    → the running game (App renders the normal Header + TabContent shell)
//   'career'  → Ultimate Career mode screen
export const menuScreen = writable('menu');

// 'roster' | 'career' | null — which gamemode the player picked.
export const selectedMode = writable(null);

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
        available: false,
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
