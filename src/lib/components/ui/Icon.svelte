<script>
    // One line-icon set for the whole roster shell, so the nav, the Play menu and every tab
    // draw from the same 24px grid and the same stroke weight instead of a mix of emoji that
    // render differently on every OS. Paths are hand-authored for this project.
    //
    // Usage: <Icon name="trophy" size={20} />. Colour follows `currentColor`, so an icon
    // takes the text colour of whatever it sits in. An unknown name renders nothing rather
    // than throwing — a typo should cost an icon, never a tab.
    export let name;
    export let size = 18;
    export let stroke = 1.9;
    /** Accessible label. Omit for decorative icons (the default), which are aria-hidden. */
    export let label = '';

    const P = {
        // ── navigation ──
        home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
        store: '<path d="M4.5 8h15l-1.2 12.5H5.7L4.5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
        club: '<rect x="3.5" y="6" width="17" height="14" rx="2.5"/><path d="M8 6V4.5h8V6"/><path d="M3.5 12h17"/><path d="M11 12v2h2v-2"/>',
        squad: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M21.5 20a6.5 6.5 0 0 0-4-6"/>',
        academy: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9z"/><path d="M6.5 11v5c1.5 1.5 3.5 2.3 5.5 2.3s4-.8 5.5-2.3v-5"/><path d="M21.5 9v5.5"/>',
        puzzle: '<path d="M9.5 4.5h-5v5a2 2 0 1 1 0 4v5h5a2 2 0 1 1 4 0h5v-5a2 2 0 1 0 0-4v-5h-5a2 2 0 1 0-4 0z"/>',
        calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M8 17h2"/>',
        quests: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M15 3.5V7h3.5"/><path d="M9 12l1.8 1.8L14.5 10"/><path d="M9 17h6"/>',
        gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8"/><path d="M12 8.5v12"/><path d="M12 8.5C10.5 5 7 4.5 7 6.8 7 8.5 12 8.5 12 8.5zM12 8.5c1.5-3.5 5-4 5-1.7 0 1.7-5 1.7-5 1.7z"/>',
        upgrade: '<path d="M12 20V7"/><path d="M6.5 12.5 12 7l5.5 5.5"/><path d="M5 4h14"/>',
        skills: '<path d="M12 3.5 14.4 9l5.6.4-4.3 3.7 1.4 5.6L12 15.6l-5.1 3.1 1.4-5.6L4 9.4 9.6 9z"/>',
        archive: '<rect x="3.5" y="4" width="17" height="4.5" rx="1.2"/><path d="M5 8.5V20h14V8.5"/><path d="M10 12.5h4"/>',
        ranking: '<path d="M4 20V13h4.5v7M9.75 20V8h4.5v12M15.5 20v-9.5H20V20"/><path d="M3 20.5h18"/>',
        friends: '<circle cx="8" cy="9" r="3.2"/><circle cx="16.5" cy="9.5" r="2.7"/><path d="M2.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M13.5 15a5 5 0 0 1 8 4.5"/>',
        guide: '<path d="M4.5 5.5c2.5-1.3 5-1.3 7.5 0v14c-2.5-1.3-5-1.3-7.5 0z"/><path d="M12 5.5c2.5-1.3 5-1.3 7.5 0v14c-2.5-1.3-5-1.3-7.5 0"/>',
        trade: '<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>',
        welcome: '<path d="M7 11.5V6.8a1.6 1.6 0 0 1 3.2 0V11"/><path d="M10.2 10.5V5.3a1.6 1.6 0 0 1 3.2 0v5.2"/><path d="M13.4 10.5V6.3a1.6 1.6 0 0 1 3.2 0V13"/><path d="M7 11.5 5.6 10a1.6 1.6 0 0 0-2.3 2.2l3.4 4.5A7 7 0 0 0 12.3 20H13a5.6 5.6 0 0 0 5.6-5.6V9.3a1.5 1.5 0 0 0-2-1.5"/>',
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
        user: '<circle cx="12" cy="8.5" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
        // ── play ──
        play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/>',
        coffee: '<path d="M4 10h12.5v4.5A5.5 5.5 0 0 1 11 20H9.5A5.5 5.5 0 0 1 4 14.5z"/><path d="M16.5 11h1.3a2.6 2.6 0 0 1 0 5.2h-1.6"/><path d="M8 3.5c0 1.6 1.2 1.6 1.2 3.2M12 3.5c0 1.6 1.2 1.6 1.2 3.2"/>',
        flag: '<path d="M5 21V3.5"/><path d="M5 4h12.5l-2.3 4.3 2.3 4.2H5"/>',
        flame: '<path d="M12 2.8c.7 3.3 5.5 5.2 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.8 1.6-4.6 2.8-5.6.2 1.8 1 2.9 2.2 3.4-.2-3.3-.5-5.6.5-8.4z"/>',
        waves: '<path d="M2.5 8c2.4 0 2.4-2 4.75-2S9.6 8 12 8s2.4-2 4.75-2S19.1 8 21.5 8"/><path d="M2.5 13c2.4 0 2.4-2 4.75-2S9.6 13 12 13s2.4-2 4.75-2 2.35 2 4.75 2"/><path d="M2.5 18c2.4 0 2.4-2 4.75-2S9.6 18 12 18s2.4-2 4.75-2 2.35 2 4.75 2"/>',
        globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
        trophy: '<path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M16.5 5.5h3V7a3.5 3.5 0 0 1-3.5 3.5M7.5 5.5h-3V7A3.5 3.5 0 0 0 8 10.5"/><path d="M12 14v3.5M8.5 20.5h7M9.5 20.5l.5-3h4l.5 3"/>',
        crown: '<path d="M3.5 8.5 7.5 12 12 5l4.5 7 4-3.5-1.8 10H5.3z"/><path d="M5.5 21h13"/>',
        tower: '<path d="M7 21V9.5L5 7.5V3.5h3v2h2.2v-2h3.6v2H16v-2h3v4l-2 2V21"/><path d="M4 21h16"/><path d="M10.2 21v-3.5a1.8 1.8 0 0 1 3.6 0V21"/><path d="M10.5 12h3"/>',
        cards: '<rect x="3.5" y="7" width="10.5" height="14" rx="2"/><path d="M8.5 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4.5"/>',
        coins: '<ellipse cx="9" cy="7" rx="5.5" ry="2.8"/><path d="M3.5 7v4.5c0 1.6 2.5 2.8 5.5 2.8s5.5-1.2 5.5-2.8V7"/><path d="M14.5 10.6c3.1.2 5.5 1.4 5.5 2.9v4.2c0 1.6-2.5 2.8-5.5 2.8-2.5 0-4.6-.8-5.3-2"/><path d="M14.5 15.5c3 0 5.5-1.2 5.5-2.8"/>',
        swords: '<path d="M14.5 17.5 3.5 6.5v-3h3l11 11"/><path d="M13 19l6-6M16 16l4 4M19.5 20.5l1-1"/><path d="M9.5 6.5l4-4h3v3l-4 4"/><path d="M5 14l4 4M7 17l-3 3M3.5 19.5l1 1"/>',
        target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
        map: '<path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13L15 19.5 9 17l-5.5 2.5z"/><path d="M9 4v13M15 6.5v13"/>',
        trend: '<path d="M3.5 17 9 11.5l4 4 7.5-8"/><path d="M15 7.5h5.5V13"/>',
        snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2"/>',
        skull: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7.2 0 2.4 1 4.1 2.5 5.1V19h10v-3.2c1.5-1 2.5-2.7 2.5-5.1 0-4.2-3.1-7.2-7.5-7.2z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10.5 19v1.5M13.5 19v1.5"/>',
        medal: '<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 10 6 3.5h4l2 4.5 2-4.5h4L15.5 10"/><path d="m12 12 .9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/>',
        // ── state ──
        lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
        unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.6"/>',
        pin: '<path d="M9 3.5h6l-.8 5.2 3.3 3.3H6.5l3.3-3.3z"/><path d="M12 12v8.5"/>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
        close: '<path d="M6 6l12 12M18 6 6 18"/>',
        copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.2"/><path d="M15.5 8.5V5.7a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2h2.8"/>',
        check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
        chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
        arrow: '<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>',
        bolt: '<path d="M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5z"/>',
        star: '<path d="M12 3.5 14.4 9l5.6.4-4.3 3.7 1.4 5.6L12 15.6l-5.1 3.1 1.4-5.6L4 9.4 9.6 9z"/>',
        shield: '<path d="M12 3 19.5 6v5.8c0 4.6-3.2 7.9-7.5 9.2-4.3-1.3-7.5-4.6-7.5-9.2V6z"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        gem: '<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
        sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M19 16c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3z"/>',
        palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.8-1.8 0-1.2-1-1.6-1-2.7 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.7 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
        volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
        mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    };

    $: inner = P[name] || '';
</script>

{#if inner}
    <svg
        class="ico"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width={stroke}
        stroke-linecap="round"
        stroke-linejoin="round"
        role={label ? 'img' : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : 'true'}
    >{@html inner}</svg>
{/if}

<style>
    .ico { display: inline-block; flex-shrink: 0; vertical-align: middle; }
</style>
