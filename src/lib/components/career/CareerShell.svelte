<script>
    // ═══════════════════════════════════════════════════════════════════
    //  LoL ULTIMATE CAREER — mode shell
    // ═══════════════════════════════════════════════════════════════════
    //  Career mode is not a tab. It has its own save file (lurc_*), its own
    //  header and its own navigation, so App.svelte swaps this in wholesale
    //  instead of rendering it inside the Ultimate Roster shell. Nothing in
    //  here touches roster state.

    import { onDestroy } from 'svelte';
    import { openMenu } from '../../stores/menu.js';
    import { playSound } from '../../utils/sound.js';
    import {
        career, careerScreen, matchState, careerOverlay,
        careerOVR, careerPotOVR, currentTeam, currentPhase, soloRank,
        initCareer, flushCareer, saveCareer,
    } from '../../stores/career.js';
    import { maybeAutoPublish } from '../../stores/careerBoard.js';
    import { activeSlot } from '../../utils/storage.js';
    import {
        CAREER_SCREENS, REGION_BY_ID, ROLE_BY_ID, ENERGY_MAX, HEALTH_MAX,
    } from '../../career/constants.js';
    import {
        ovrTier, ovrLabel, formLabel, moraleLabel, energyLabel, healthLabel,
        fmtGold, fmtFollowers,
    } from '../../career/ratings.js';

    import CreatePlayer from './CreatePlayer.svelte';
    import Hub from './Hub.svelte';
    import Training from './Training.svelte';
    import Club from './Club.svelte';
    import Calendar from './Calendar.svelte';
    import Shop from './Shop.svelte';
    import Transfers from './Transfers.svelte';
    import Profile from './Profile.svelte';
    import CareerBoard from './CareerBoard.svelte';
    import MatchDay from './MatchDay.svelte';
    import CareerOverlay from './CareerOverlay.svelte';

    // Hydrate synchronously (like initGame() in App.svelte) so the very first
    // render already knows whether a career exists — otherwise the creation
    // screen flashes for a frame on every entry.
    initCareer();

    // Career mode owns the whole viewport while it is open; the roster shell's
    // footer spacing does not apply here.
    const autoSave = setInterval(() => saveCareer(), 60 * 1000);
    onDestroy(() => { clearInterval(autoSave); flushCareer(); });

    // Keep a PUBLISHED board entry current, scoped to real career EVENTS rather
    // than to the store as a whole. history.length increments exactly once per
    // split close, so this fires at a split close and at retirement and nowhere
    // else -- never on a gold grant, never on a week tick, never on a view.
    //
    // It lives here because CareerShell is the one place initCareer() has
    // provably run, and because putting it in engine.js or awards.js would drag
    // Firebase into the career subsystem, which today imports nothing from auth
    // or Firebase at all.
    //
    // maybeAutoPublish() is itself a no-op unless the account already has a
    // published row whose careerId matches this save, so nothing is ever put on
    // the board without an explicit first press.
    let _pubSig = '';
    $: {
        const sig = $career.created
            ? ($career.history.length + ':' + ($career.flags.retired ? 1 : 0))
            : '';
        if (sig && sig !== _pubSig) {
            _pubSig = sig;
            maybeAutoPublish($career, activeSlot('career'));
        }
    }

    $: p = $career.player;
    $: region = REGION_BY_ID[p.region] || REGION_BY_ID.LEC;
    $: role = ROLE_BY_ID[p.role] || ROLE_BY_ID.MID;
    $: tier = ovrTier($careerOVR);
    $: form = formLabel(p.form);
    $: morale = moraleLabel(p.morale);
    $: energy = energyLabel(p.energy);
    $: health = healthLabel(p.health);
    $: teamName = $currentTeam ? $currentTeam.name : 'Free Agent';
    $: teamAccent = $currentTeam ? $currentTeam.accent : '#64748b';

    // A match takes over the entire shell — no header, no nav, no way to walk
    // away mid-series. That is deliberate: results have to be lived with.
    $: inMatch = !!$matchState;

    function go(id) {
        if ($careerScreen === id) return;
        playSound('click');
        careerScreen.set(id);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    function leave() {
        playSound('click');
        flushCareer();
        openMenu();
    }

    const METERS = [
        { key: 'energy', label: 'Energy', max: ENERGY_MAX },
        { key: 'form',   label: 'Form',   max: 100 },
        { key: 'morale', label: 'Morale', max: 100 },
        { key: 'health', label: 'Health', max: HEALTH_MAX },
    ];
    $: meterInfo = { energy, form, morale, health };
</script>

<section class="career-root">
    {#if !$career.created}
        <CreatePlayer />

    {:else if inMatch}
        <MatchDay />

    {:else}
        <!-- ══════════════ HEADER ══════════════ -->
        <header class="chead" style="--team:{teamAccent}; --tier:{tier.color}">
            <div class="chead-in">
                <button class="back" on:click={leave} title="Back to main menu" aria-label="Back to main menu">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M10 3 5 8l5 5" />
                    </svg>
                </button>

                <!-- Identity -->
                <div class="ident">
                    <div class="ovr" title="{ovrLabel($careerOVR)} — potential {$careerPotOVR}">
                        <span class="ovr-n">{$careerOVR}</span>
                        <span class="ovr-l">OVR</span>
                    </div>
                    <div class="who">
                        <div class="who-top">
                            <span class="handle">{p.handle}</span>
                            <span class="flag" aria-hidden="true">{region.flag}</span>
                            <span class="rolechip" style="--rc:{role.accent}">{role.short}</span>
                        </div>
                        <div class="who-sub">
                            <span class="team" style="--t:{teamAccent}">{teamName}</span>
                            <span class="dot">·</span>
                            <span>Age {p.age}</span>
                            <span class="dot">·</span>
                            <span class="rank" style="--rk:{$soloRank.color}">{$soloRank.label}</span>
                        </div>
                    </div>
                </div>

                <!-- Condition meters -->
                <div class="meters" role="group" aria-label="Player condition">
                    {#each METERS as m}
                        {@const info = meterInfo[m.key]}
                        <div class="meter" title="{m.label}: {Math.round(p[m.key])} — {info.name}">
                            <div class="m-top">
                                <span class="m-lbl">{m.label}</span>
                                <span class="m-val" style="color:{info.color}">{Math.round(p[m.key])}</span>
                            </div>
                            <div class="m-bar">
                                <div class="m-fill" style="width:{Math.max(0, Math.min(100, (p[m.key] / m.max) * 100))}%; background:{info.color}"></div>
                            </div>
                        </div>
                    {/each}
                </div>

                <!-- Wallet + clock -->
                <div class="wallet">
                    <div class="w-cell" title="Gold">
                        <span class="w-ico" aria-hidden="true">&#x1F4B0;</span>
                        <span class="w-val">{fmtGold($career.money.gold)}</span>
                    </div>
                    <div class="w-cell" title="Followers">
                        <span class="w-ico" aria-hidden="true">&#x1F464;</span>
                        <span class="w-val">{fmtFollowers($career.money.followers)}</span>
                    </div>
                    <div class="w-cell" title="Legacy Points — earned from titles and milestones">
                        <span class="w-ico" aria-hidden="true">&#x1F3C6;</span>
                        <span class="w-val">{$career.money.legacy}</span>
                    </div>
                    <div class="clock" style="--ph:{$currentPhase.accent}">
                        <span class="c-week">W{$career.time.week}</span>
                        <span class="c-year">{$career.time.year}</span>
                        <span class="c-phase">{$currentPhase.short}</span>
                    </div>
                </div>
            </div>

            <!-- ══════════════ NAV ══════════════ -->
            <nav class="cnav" aria-label="Career sections">
                <div class="cnav-in">
                    {#each CAREER_SCREENS as s}
                        <button
                            class="ctab"
                            class:ctab-on={$careerScreen === s.id}
                            on:click={() => go(s.id)}
                            aria-current={$careerScreen === s.id ? 'page' : undefined}
                        >
                            <span class="ctab-ico" aria-hidden="true">{s.icon}</span>
                            <span class="ctab-t">{s.name}</span>
                        </button>
                    {/each}
                    <span class="cnav-spacer"></span>
                    <span class="acts" title="Activity slots left this week">
                        <span class="acts-n">{$career.weekly.actionsLeft}</span>
                        <span class="acts-l">/ {$career.weekly.actionsMax} actions</span>
                    </span>
                </div>
            </nav>
        </header>

        <!-- ══════════════ SCREEN ══════════════ -->
        <main class="cmain">
            {#key $careerScreen}
                <div class="cscreen">
                    {#if $careerScreen === 'training'}
                        <Training />
                    {:else if $careerScreen === 'club'}
                        <Club />
                    {:else if $careerScreen === 'calendar'}
                        <Calendar />
                    {:else if $careerScreen === 'shop'}
                        <Shop />
                    {:else if $careerScreen === 'transfers'}
                        <Transfers />
                    {:else if $careerScreen === 'profile'}
                        <Profile />
                    {:else if $careerScreen === 'board'}
                        <CareerBoard />
                    {:else}
                        <Hub />
                    {/if}
                </div>
            {/key}
        </main>
    {/if}

    {#if $careerOverlay}
        <CareerOverlay />
    {/if}
</section>

<style>
    .career-root {
        flex: 1 0 auto;
        display: flex;
        flex-direction: column;
        width: 100%;
        min-height: 100%;
    }

    /* ═══════════ HEADER ═══════════ */
    .chead {
        position: sticky;
        top: 0;
        z-index: 40;
        background: rgba(6, 9, 17, 0.92);
        backdrop-filter: blur(14px) saturate(160%);
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        border-bottom: 1px solid rgba(51, 65, 85, 0.28);
    }
    .chead-in {
        max-width: 1500px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 12px 20px;
    }

    .back {
        flex-shrink: 0;
        width: 32px; height: 32px;
        display: grid; place-items: center;
        border-radius: 10px;
        color: #64748b;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(51, 65, 85, 0.35);
        cursor: pointer;
    }
    .back svg { width: 15px; height: 15px; }
    .back:hover { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.7); }

    /* Identity */
    .ident { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .ovr {
        flex-shrink: 0;
        width: 50px; height: 50px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        border-radius: 12px;
        background: color-mix(in srgb, var(--tier) 12%, rgba(15, 23, 42, 0.8));
        border: 1px solid color-mix(in srgb, var(--tier) 40%, transparent);
    }
    .ovr-n {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 21px; font-weight: 700; line-height: 1;
        color: var(--tier);
    }
    .ovr-l {
        font-size: 7px; font-weight: 800; letter-spacing: 1.4px;
        color: #475569; margin-top: 2px;
    }
    .who { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .who-top { display: flex; align-items: center; gap: 8px; }
    .handle {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
        color: #e8eefb;
        max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .flag { font-size: 13px; line-height: 1; }
    .rolechip {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px;
        color: var(--rc);
        background: color-mix(in srgb, var(--rc) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--rc) 30%, transparent);
    }
    .who-sub {
        display: flex; align-items: center; gap: 7px;
        font-size: 11px; font-weight: 600; color: #56688a;
    }
    .team { color: var(--t); font-weight: 700; }
    .rank { color: var(--rk); font-weight: 700; }
    .dot { color: #2c3a52; }

    /* Meters */
    .meters {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        flex: 1;
        min-width: 0;
        max-width: 460px;
        margin-left: auto;
    }
    .meter { min-width: 0; }
    .m-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
    .m-lbl { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }
    .m-val { font-size: 11px; font-weight: 800; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    .m-bar { height: 3px; border-radius: 3px; background: rgba(148, 163, 184, 0.12); overflow: hidden; }
    .m-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }

    /* Wallet */
    .wallet { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
    .w-cell { display: flex; align-items: center; gap: 6px; }
    .w-ico { font-size: 12px; opacity: 0.8; }
    .w-val {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 700; color: #cbd5e1;
    }
    .clock {
        display: flex; align-items: baseline; gap: 6px;
        padding: 6px 12px; border-radius: 10px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid color-mix(in srgb, var(--ph) 28%, transparent);
    }
    .c-week { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .c-year { font-size: 10px; font-weight: 700; color: #4a5b76; }
    .c-phase { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; color: var(--ph); }

    /* ═══════════ NAV ═══════════ */
    .cnav { border-top: 1px solid rgba(51, 65, 85, 0.18); }
    .cnav-in {
        max-width: 1500px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 6px 20px;
        overflow-x: auto;
        scrollbar-width: none;
    }
    .cnav-in::-webkit-scrollbar { display: none; }
    .ctab {
        display: flex; align-items: center; gap: 7px;
        padding: 8px 14px;
        border-radius: 9px;
        border: 1px solid transparent;
        background: transparent;
        font-family: inherit;
        font-size: 12px; font-weight: 700;
        color: #64748b;
        cursor: pointer;
        white-space: nowrap;
    }
    .ctab:hover { color: #cbd5e1; background: rgba(51, 65, 85, 0.32); }
    .ctab-on {
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.12);
        border-color: rgba(139, 92, 246, 0.28);
    }
    .ctab-ico { font-size: 12px; opacity: 0.9; }
    .cnav-spacer { flex: 1; }
    .acts {
        display: flex; align-items: baseline; gap: 5px;
        padding: 5px 12px; border-radius: 8px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.3);
        white-space: nowrap;
    }
    .acts-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 14px; font-weight: 800; color: #a78bfa;
    }
    .acts-l { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; color: #475569; }

    /* ═══════════ MAIN ═══════════ */
    .cmain {
        flex: 1;
        width: 100%;
        max-width: 1500px;
        margin: 0 auto;
        padding: 24px 20px 56px;
    }
    .cscreen { animation: cFade 0.28s ease both; }
    @keyframes cFade {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: none; }
    }

    /* ═══════════ RESPONSIVE ═══════════ */
    @media (max-width: 1180px) {
        .meters { max-width: 320px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
    }
    @media (max-width: 900px) {
        .chead-in { flex-wrap: wrap; gap: 12px; padding: 10px 14px; }
        .meters { order: 3; max-width: none; width: 100%; margin-left: 0; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .wallet { margin-left: auto; gap: 10px; }
        .cmain { padding: 18px 14px 48px; }
        .cnav-in { padding: 6px 14px; }
    }
    @media (max-width: 620px) {
        .handle { max-width: 120px; font-size: 14px; }
        .ovr { width: 42px; height: 42px; }
        .ovr-n { font-size: 18px; }
        .w-cell:nth-child(3) { display: none; }
        .ctab-t { display: none; }
        .ctab { padding: 8px 12px; }
        .ctab-ico { font-size: 15px; }
    }
</style>
