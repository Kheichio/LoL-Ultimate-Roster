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
//   'studio'  → the Studio8Heads page (who we are, our games, partners)
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

// ─────────────────────────────────────────────────────────────────────────
//  STUDIO8HEADS
//  The Studio8Heads page (menuScreen 'studio') reads everything from STUDIO, and a list left
//  empty simply hides its section. Keep it factual: this page speaks for the studio, and every
//  line of it came from the studio. A game's `status` is one of:
//    active  — live and maintained            beta — playable, still in development
//    retired — still playable, no longer maintained
// ─────────────────────────────────────────────────────────────────────────
export const GAME_STATUS = {
    active:  { label: 'Active', color: '#34d399' },
    beta:    { label: 'In beta', color: '#fbbf24' },
    retired: { label: 'No longer maintained', color: '#f87171' },
};

export const STUDIO = {
    name: 'Studio8Heads',
    tagline: 'The studio behind Anime Guessing Quiz, Khei\'s Archive and LoL Ultimate Roster.',
    intro: 'We make games you can play right in your browser and games you can download. Our biggest web project is Anime Guessing Quiz, our current main game is Khei\'s Archive: Relicbound — and you are playing LoL Ultimate Roster right now.',
    itch: 'https://studio8heads.itch.io/',
    discord: 'https://discord.gg/ur62KfPfYT',
    // Played in the browser. `current: true` is the game this page is inside.
    web: [
        {
            id: 'agq', name: 'Anime Guessing Quiz', status: 'active', icon: 'sparkle', color: '#f472b6',
            href: 'https://www.animeguessingquiz.com/',
            blurb: 'Guess the anime, the character, the genres — or whatever else you can imagine, all within easy reach. Our biggest web project, with a lot of time and effort invested in it.',
            credit: 'Made by Higoshi & Kechio',
            extra: [{ label: 'Discord server', href: 'https://discord.gg/64hUqBpeCh', icon: 'friends' }],
            featured: true,
        },
        {
            id: 'lur', name: 'LoL Ultimate Roster', status: 'beta', icon: 'cards', color: '#3b82f6',
            href: 'https://www.lol-ultimate-roster.xyz/',
            blurb: 'A League of Legends esports game inspired by FIFA Ultimate Team and its career modes. Pull cards of players from all of League\'s esports history — or become the player and play alongside them.',
            current: true,
        },
        {
            // The deployed host has a typo in it ("suvivors"). It is the URL that actually
            // resolves, so it stays exactly as-is — it just is not shown anywhere in the UI.
            id: 'gacha-survivors', name: 'Gacha Survivors', status: 'retired', icon: 'swords', color: '#22d3ee',
            href: 'https://gacha-suvivors.vercel.app/',
            blurb: 'A pixel-art gacha game in the style of Vampire Survivors. A demo.',
        },
    ],
    // Downloadable, on itch.io.
    downloads: [
        {
            id: 'kheis-archive', name: 'Khei\'s Archive: Relicbound', status: 'active', icon: 'archive', color: '#a78bfa',
            version: '1.0.3-BETA',
            href: 'https://studio8heads.itch.io/kheis-archive-relicbound',
            blurb: 'Our current main game project: a trading card game that turns existing media, such as anime and video games, into cards.',
            featured: true,
        },
        {
            id: 'lost-ryo', name: 'Lost Ryo', status: 'retired', icon: 'flag', color: '#94a3b8',
            href: 'https://studio8heads.itch.io/lost-ryo',
            blurb: 'A demo platformer made in 2023 as a trial project.',
        },
    ],
    // { name, role, blurb }
    team: [],
    links: [
        { label: 'Studio8Heads Discord', href: 'https://discord.gg/ur62KfPfYT', icon: 'friends' },
        { label: 'All our downloadable games on itch.io', href: 'https://studio8heads.itch.io/', icon: 'archive' },
        { label: 'Anime Guessing Quiz Discord', href: 'https://discord.gg/64hUqBpeCh', icon: 'friends' },
    ],
    partners: [
        { name: 'SISL', href: 'https://sisl.pl/', blurb: 'LoL Ultimate Roster is made in collaboration with SISL.' },
    ],
};

// "More games by us" tiles on the main menu: the studio's live flagship titles. The full list,
// retired games included, is on the Studio8Heads page.
export const MORE_GAMES = [...STUDIO.web, ...STUDIO.downloads].filter(g => g.featured && g.status === 'active' && !g.current);

export function openStudio() {
    menuScreen.set('studio');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

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
