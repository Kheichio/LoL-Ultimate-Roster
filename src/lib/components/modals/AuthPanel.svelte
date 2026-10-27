<script>
    // ═══════════════════════════════════════════════════════════════════════════
    //  SETTINGS
    //  One panel for everything the player can set: their account and cloud backup,
    //  how the game looks, sound, redeem codes, and their saves. It grew out of the old
    //  account panel (hence the file name) and still owns sign-in, so every existing
    //  `showAuthPanel.set(true)` keeps working. Open a specific page with
    //  `openSettings(section)` from stores/ui.js.
    //
    //  Everything under Display and Sound is a DEVICE preference (storage.js DEVICE_KEYS):
    //  it is never namespaced by save slot and survives Wipe All Local Data.
    // ═══════════════════════════════════════════════════════════════════════════
    import { showAuthPanel, settingsSection, soundMuted, lightMode, toggleLightMode, matchCardView, playerPhotos, openConfirmModal } from '../../stores/ui.js';
    import { skipMinigames } from '../../stores/career.js';
    import { currentUser, authLoading, signIn, register, signOut, cloudSave, cloudLoad, resetPassword } from '../../stores/auth.js';
    import { careerSlotCount } from '../../stores/career.js';
    import { showToast } from '../../stores/toasts.js';
    import { toggleMute, getVolume, setVolume, playSound } from '../../utils/sound.js';
    import { club, collectionRegistry, blueEssence, freePacks, saveGame } from '../../stores/game.js';
    import { clearStorage, saveToStorage, loadFromStorage } from '../../utils/storage.js';
    import { getDB, makeUniqueId } from '../../utils/cards.js';
    import { trapFocus } from '../../utils/a11y.js';
    import { PLAYER_PICTURES } from '../../data/playerPictures.js';
    import { UPDATES } from '../../utils/updates.js';
    import Icon from '../ui/Icon.svelte';

    const VERSION = UPDATES[0]?.ver || '';
    const PHOTO_CARDS = Object.keys(PLAYER_PICTURES).length;

    // Class names here avoid global.css's `.nav-btn`, `.btn-primary` and `.btn-danger`, which
    // would otherwise leak uppercase text, gradients and hover jumps into the panel.
    // `short` is the phone tab label, so all five sections fit across a 390px screen.
    const NAV = [
        { id: 'account', label: 'Account',      short: 'Account', icon: 'user' },
        { id: 'display', label: 'Display',      short: 'Display', icon: 'palette' },
        { id: 'sound',   label: 'Sound',        short: 'Sound',   icon: 'volume' },
        { id: 'codes',   label: 'Redeem code',  short: 'Codes',   icon: 'gift' },
        { id: 'data',    label: 'Data & saves', short: 'Data',    icon: 'shield' },
    ];

    $: isSignedIn = $currentUser !== null;
    $: section = NAV.some(n => n.id === $settingsSection) ? $settingsSection : 'display';
    $: head = {
        account: { title: 'Account', desc: isSignedIn ? 'Your profile and cloud backup.' : 'Sign in to back up your progress and play on any device.' },
        display: { title: 'Display', desc: 'How the game looks on this device.' },
        sound:   { title: 'Sound', desc: 'Sound effects and volume on this device.' },
        codes:   { title: 'Redeem code', desc: 'Enter a code for cards, Blue Essence or packs.' },
        data:    { title: 'Data & saves', desc: 'Where your progress is kept, and how to reset it.' },
    }[section];

    let bodyEl;
    function go(id) {
        settingsSection.set(id);
        if (bodyEl) bodyEl.scrollTop = 0;
    }

    // Recomputed every time the panel opens, and after a cloud load changes it. Read from
    // storage: the career store is blank until CareerShell mounts, so counting it would
    // report nothing at the menu.
    $: careerSlots = ($showAuthPanel || $authLoading) ? careerSlotCount() : 0;

    // ── Account ──
    let authMode = 'signin'; // signin | register
    let email = '';
    let password = '';
    let regName = '';
    let regEmail = '';
    let regPass = '';
    $: initial = (($currentUser && ($currentUser.displayName || $currentUser.email)) || 'M').trim().charAt(0).toUpperCase();

    async function handleSignIn() {
        if (!email || !password) { showToast('Enter email and password.', 'error'); return; }
        const ok = await signIn(email, password);
        if (ok) { email = ''; password = ''; }
    }

    async function handleRegister() {
        if (!regName || !regEmail || !regPass) { showToast('Fill all fields.', 'error'); return; }
        if (regPass.length < 6) { showToast('Password must be 6+ characters.', 'error'); return; }
        const ok = await register(regName, regEmail, regPass);
        if (ok) { regName = ''; regEmail = ''; regPass = ''; }
    }

    async function handleSignOut() {
        await signOut();
    }

    // ── Display ──
    function setTheme(light) {
        if (light !== $lightMode) toggleLightMode();
    }

    // ── Sound ──
    let volume = getVolume();
    function handleMute() {
        const muted = toggleMute();
        soundMuted.set(muted);
        if (!muted) playSound('claim');
    }
    function onVolume() { setVolume(volume); }
    function previewVolume() { playSound('claim'); }

    // ── Redeem code ──
    let redeemCode = '';
    // Per-save, not per-device: shared across slots, one slot redeeming a code would
    // lock every other slot out of it. Back-compat: this key was always written as a
    // JSON object, so pre-slot records decode unchanged — the shape check is only
    // there so a corrupt value starts empty instead of throwing at component setup.
    const _storedCodes = loadFromStorage('lur_redeemed_codes');
    let redeemedCodes = (_storedCodes && typeof _storedCodes === 'object' && !Array.isArray(_storedCodes)) ? _storedCodes : {};
    $: redeemedList = Object.keys(redeemedCodes).filter(k => redeemedCodes[k]);

    const PACK_NAMES = { champion: 'Champion', msi: 'MSI', ewc: 'EWC', firststand: 'First Stand', elite: 'Elite', premium: 'Premium' };

    // A code grants any mix of: one card (`card`), Blue Essence (`be`) and free Store packs
    // (`packs`, keyed by Store pack id — they land in the Store's Free Packs row exactly like
    // RBC rewards). Codes never expire; redeeming is once per save.
    const CODES = {
        'MSISIG2024': { label: 'MSI Signature Card', card: { quality: 'MSI', signature: true } },
        'MSI2026': { label: 'MSI 2026 Signature Card', card: { quality: 'MSI', signature: true } },
        'WELCOMEBACK': { label: '5,000 Blue Essence', be: 5000 },
        'WORLDS2026': { label: 'Worlds 2026 bundle', card: { quality: 'Champion', signature: true }, packs: { champion: 1 } },
    };

    function redeemCodeFn() {
        const code = redeemCode.trim().toUpperCase();
        if (!code) { showToast('Enter a code.', 'error'); return; }
        if (redeemedCodes[code]) { showToast('Code already redeemed.', 'error'); return; }
        const reward = CODES[code];
        if (!reward) { showToast('Invalid code.', 'error'); return; }

        // Resolve the card BEFORE granting anything, so a missing database refuses the whole
        // code instead of paying out the BE half and burning it.
        let card = null;
        if (reward.card) {
            const db = getDB();
            if (!db) { showToast('Database not loaded.', 'error'); return; }
            const pool = db.filter(c => c.quality === reward.card.quality && c.role !== 'COACH');
            if (pool.length === 0) { showToast('No cards available.', 'error'); return; }
            const base = pool[Math.floor(Math.random() * pool.length)];
            card = { ...base, uniqueId: makeUniqueId('code_'), signature: !!reward.card.signature, holographic: !!reward.card.holographic };
        }

        const got = [];
        if (card) {
            club.update(c => [...c, card]);
            collectionRegistry.update(r => ({ ...r, [card.id]: true }));
            got.push(`${card.name}${card.signature ? ' (Signature)' : ''}`);
        }
        if (reward.be) {
            blueEssence.update(v => v + reward.be);
            got.push(`+${reward.be.toLocaleString()} BE`);
        }
        if (reward.packs) {
            freePacks.update(fp => {
                const next = { ...fp };
                for (const [id, n] of Object.entries(reward.packs)) next[id] = (next[id] || 0) + n;
                return next;
            });
            for (const [id, n] of Object.entries(reward.packs)) got.push(`${n} free ${PACK_NAMES[id] || id} pack${n > 1 ? 's' : ''}`);
        }
        playSound(card ? 'rare' : 'claim');
        showToast(`Redeemed ${reward.label}! ${got.join(' · ')}`, 'success');

        redeemedCodes[code] = true;
        saveToStorage('lur_redeemed_codes', redeemedCodes);
        redeemCode = '';
        saveGame();
    }

    // ── Data ──
    function wipeAccount() {
        openConfirmModal('This will erase EVERY save slot in BOTH gamemodes — every Ultimate Roster slot (cards, squad, progress, quests) and every Ultimate Career slot. Only your device settings survive. You cannot undo this.', () => {
            clearStorage();
            showToast('Account wiped. Reloading...', 'info');
            setTimeout(() => location.reload(), 800);
        });
    }

    function close() {
        showAuthPanel.set(false);
        authMode = 'signin';
    }
</script>

{#if $showAuthPanel}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="overlay" on:click|self={close}>
    <div class="sp" use:trapFocus={{ onClose: close }} role="dialog" aria-modal="true" aria-labelledby="sp-title" tabindex="-1">

        <!-- ── Sidebar ── -->
        <aside class="nav">
            <div class="brand">
                <span class="brand-ico"><Icon name="settings" size={18} /></span>
                <span class="brand-text">Settings</span>
            </div>
            <div class="nav-list" role="tablist" aria-label="Settings sections">
                {#each NAV as n (n.id)}
                    <button class="sec-btn" class:nav-on={section === n.id} role="tab" aria-selected={section === n.id} on:click={() => go(n.id)}>
                        <Icon name={n.icon} size={17} />
                        <span class="nav-label">{n.label}</span>
                        <span class="nav-short">{n.short}</span>
                        {#if n.id === 'account'}
                            <span class="nav-dot" class:nav-dot-on={isSignedIn} title={isSignedIn ? 'Signed in' : 'Not signed in'}></span>
                        {/if}
                    </button>
                {/each}
            </div>
            <div class="nav-foot">{VERSION}</div>
        </aside>

        <!-- ── Page ── -->
        <section class="main">
            <header class="head">
                <div>
                    <h2 class="head-title" id="sp-title">{head.title}</h2>
                    <p class="head-desc">{head.desc}</p>
                </div>
                <button class="x" on:click={close} aria-label="Close settings"><Icon name="close" size={16} stroke={2.2} /></button>
            </header>

            <div class="body" bind:this={bodyEl}>
                {#if section === 'account'}
                    {#if isSignedIn}
                        <div class="profile">
                            <div class="avatar">{initial}</div>
                            <div class="profile-text">
                                <div class="profile-name">{$currentUser.displayName || 'Manager'}</div>
                                <div class="profile-email">{$currentUser.email}</div>
                            </div>
                            <span class="chip chip-ok"><span class="chip-dot"></span>Signed in</span>
                        </div>

                        <div class="group">
                            <div class="group-title">Cloud backup</div>
                            <div class="row row-stack">
                                <div class="row-text">
                                    <div class="row-label">Back up or restore this device</div>
                                    <div class="row-desc">
                                        Saves your club and every Ultimate Career slot to your account, so both carry over to any
                                        device you sign in on. On this device: {$club.length.toLocaleString()} cards and {careerSlots} career {careerSlots === 1 ? 'slot' : 'slots'}.
                                    </div>
                                </div>
                                <div class="btn-row">
                                    <button class="btn btn-accent" on:click={cloudSave} disabled={$authLoading}>
                                        <Icon name="upgrade" size={15} stroke={2.2} /> {$authLoading ? 'Working…' : 'Save to cloud'}
                                    </button>
                                    <button class="btn" on:click={cloudLoad} disabled={$authLoading}>
                                        <Icon name="archive" size={15} stroke={2.2} /> {$authLoading ? 'Working…' : 'Load from cloud'}
                                    </button>
                                </div>
                                <div class="note note-warn">Loading replaces what is on this device. It also loads saves from the old website.</div>
                            </div>
                        </div>

                        <div class="group">
                            <div class="row">
                                <div class="row-text">
                                    <div class="row-label">Sign out</div>
                                    <div class="row-desc">Your progress stays on this device.</div>
                                </div>
                                <button class="btn btn-quiet" on:click={handleSignOut}>Sign out</button>
                            </div>
                        </div>
                    {:else}
                        <div class="guest">
                            <span class="guest-ico"><Icon name="user" size={20} /></span>
                            <div>
                                <div class="row-label">You're playing as a guest</div>
                                <div class="row-desc">Your progress is saved on this device only. Sign in to back it up to the cloud, use it on other devices, and appear on the leaderboards.</div>
                            </div>
                        </div>

                        <div class="seg seg-wide" role="radiogroup" aria-label="Sign in or create an account">
                            <button role="radio" aria-checked={authMode === 'signin'} class:seg-on={authMode === 'signin'} on:click={() => authMode = 'signin'}>Sign in</button>
                            <button role="radio" aria-checked={authMode === 'register'} class:seg-on={authMode === 'register'} on:click={() => authMode = 'register'}>Create account</button>
                        </div>

                        {#if authMode === 'signin'}
                            <form class="form" on:submit|preventDefault={handleSignIn}>
                                <label class="field">
                                    <span class="field-label">Email</span>
                                    <input type="email" autocomplete="email" bind:value={email}>
                                </label>
                                <label class="field">
                                    <span class="field-label">Password</span>
                                    <input type="password" autocomplete="current-password" bind:value={password}>
                                </label>
                                <button type="submit" class="btn btn-accent btn-block" disabled={$authLoading}>{$authLoading ? 'Signing in…' : 'Sign in'}</button>
                                <button type="button" class="link" on:click={() => resetPassword(email)}>Forgot your password?</button>
                            </form>
                        {:else}
                            <form class="form" on:submit|preventDefault={handleRegister}>
                                <label class="field">
                                    <span class="field-label">Display name</span>
                                    <input type="text" autocomplete="nickname" bind:value={regName}>
                                </label>
                                <label class="field">
                                    <span class="field-label">Email</span>
                                    <input type="email" autocomplete="email" bind:value={regEmail}>
                                </label>
                                <label class="field">
                                    <span class="field-label">Password</span>
                                    <input type="password" autocomplete="new-password" placeholder="At least 6 characters" bind:value={regPass}>
                                </label>
                                <button type="submit" class="btn btn-accent btn-block" disabled={$authLoading}>{$authLoading ? 'Creating…' : 'Create account'}</button>
                            </form>
                        {/if}
                    {/if}

                {:else if section === 'display'}
                    <div class="group">
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Theme</div>
                                <div class="row-desc">Dark is the default.</div>
                            </div>
                            <div class="seg" role="radiogroup" aria-label="Theme">
                                <button role="radio" aria-checked={!$lightMode} class:seg-on={!$lightMode} on:click={() => setTheme(false)}>Dark</button>
                                <button role="radio" aria-checked={$lightMode} class:seg-on={$lightMode} on:click={() => setTheme(true)}>Light</button>
                            </div>
                        </div>
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Player photos <span class="tag">Beta</span></div>
                                <div class="row-desc">Show real player photos on cards instead of initials. Photos are being added over time; {PHOTO_CARDS} cards have one so far.</div>
                            </div>
                            <button class="sw" role="switch" aria-checked={$playerPhotos} aria-label="Player photos" class:sw-on={$playerPhotos} on:click={() => playerPhotos.set(!$playerPhotos)}><span class="knob"></span></button>
                        </div>
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Match lineups</div>
                                <div class="row-desc">How both teams appear on the match screen. You can also switch this during a match.</div>
                            </div>
                            <div class="seg" role="radiogroup" aria-label="Match lineups">
                                <button role="radio" aria-checked={$matchCardView} class:seg-on={$matchCardView} on:click={() => matchCardView.set(true)}>Cards</button>
                                <button role="radio" aria-checked={!$matchCardView} class:seg-on={!$matchCardView} on:click={() => matchCardView.set(false)}>Compact</button>
                            </div>
                        </div>
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Skip training minigames</div>
                                <div class="row-desc">Ultimate Career: practice, scrims, solo queue and VOD review earn XP, and every level gives attribute points to spend in Training. Turn off to train with the minigame drills instead.</div>
                            </div>
                            <button class="sw" role="switch" aria-checked={$skipMinigames} aria-label="Skip training minigames" class:sw-on={$skipMinigames} on:click={() => skipMinigames.set(!$skipMinigames)}><span class="knob"></span></button>
                        </div>
                    </div>

                {:else if section === 'sound'}
                    <div class="group">
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Sound effects</div>
                                <div class="row-desc">Clicks, pack openings, wins and losses.</div>
                            </div>
                            <button class="sw" role="switch" aria-checked={!$soundMuted} aria-label="Sound effects" class:sw-on={!$soundMuted} on:click={handleMute}><span class="knob"></span></button>
                        </div>
                        <div class="row" class:row-off={$soundMuted}>
                            <div class="row-text">
                                <div class="row-label">Volume</div>
                                <div class="row-desc">{$soundMuted ? 'Turn sound effects on to change the volume.' : 'Let go of the slider to hear a sample.'}</div>
                            </div>
                            <div class="vol">
                                <Icon name={$soundMuted || volume === 0 ? 'mute' : 'volume'} size={16} />
                                <input type="range" min="0" max="100" step="5" aria-label="Volume" bind:value={volume} on:input={onVolume} on:change={previewVolume} disabled={$soundMuted} style="--fill: {volume}%">
                                <span class="vol-n">{volume}%</span>
                            </div>
                        </div>
                    </div>

                {:else if section === 'codes'}
                    <div class="group">
                        <div class="row row-stack">
                            <div class="row-text">
                                <div class="row-label">Code</div>
                                <div class="row-desc">Each code can be redeemed once per save slot. Codes are not case sensitive.</div>
                            </div>
                            <form class="code-row" on:submit|preventDefault={redeemCodeFn}>
                                <input type="text" class="code-input" bind:value={redeemCode} placeholder="Enter code" aria-label="Code" autocomplete="off" spellcheck="false">
                                <button type="submit" class="btn btn-accent">Redeem</button>
                            </form>
                        </div>
                    </div>
                    {#if redeemedList.length}
                        <div class="group">
                            <div class="group-title">Redeemed on this save</div>
                            <div class="codes">
                                {#each redeemedList as c (c)}
                                    <span class="code-chip"><Icon name="check" size={12} stroke={2.6} /> {c}</span>
                                {/each}
                            </div>
                        </div>
                    {/if}

                {:else if section === 'data'}
                    <div class="group">
                        <div class="group-title">Saving</div>
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Saved automatically</div>
                                <div class="row-desc">Your progress saves to this browser as you play, in three save slots per gamemode. Choose a slot from the main menu.</div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Cloud backup</div>
                                <div class="row-desc">{isSignedIn ? 'Back up your club and careers to your account.' : 'Sign in to back up your club and careers to the cloud.'}</div>
                            </div>
                            {#if isSignedIn}
                                <button class="btn" on:click={cloudSave} disabled={$authLoading}>{$authLoading ? 'Working…' : 'Back up now'}</button>
                            {:else}
                                <button class="btn" on:click={() => go('account')}>Sign in</button>
                            {/if}
                        </div>
                    </div>

                    <div class="group group-danger">
                        <div class="group-title">Danger zone</div>
                        <div class="row">
                            <div class="row-text">
                                <div class="row-label">Wipe all local data</div>
                                <div class="row-desc">Erases every save slot in both gamemodes on this device: cards, squad, progress, quests and careers. Your settings are kept. Cannot be undone.</div>
                            </div>
                            <button class="btn btn-destroy" on:click={wipeAccount}>Wipe data</button>
                        </div>
                    </div>
                {/if}
            </div>
        </section>
    </div>
</div>
{/if}

<style>
    .overlay {
        position: fixed; inset: 0; z-index: 100;
        background: rgba(2, 6, 18, 0.72);
        backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
    }
    .sp {
        width: 100%; max-width: 860px; height: min(620px, calc(100vh - 32px));
        display: grid; grid-template-columns: 220px minmax(0, 1fr);
        background: #0b1121;
        border: 1px solid rgba(100, 116, 139, 0.22);
        border-radius: 18px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        outline: none;
    }

    /* ── Sidebar ── */
    .nav {
        display: flex; flex-direction: column;
        background: #080d1a;
        border-right: 1px solid rgba(100, 116, 139, 0.16);
        padding: 18px 12px 14px;
    }
    .brand { display: flex; align-items: center; gap: 10px; padding: 2px 8px 18px; }
    .brand-ico {
        width: 32px; height: 32px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        color: #c7d2fe; background: rgba(99, 102, 241, 0.16); border: 1px solid rgba(129, 140, 248, 0.25);
    }
    .brand-text { font-size: 16px; font-weight: 900; color: #f1f5f9; letter-spacing: 0.2px; }
    .nav-list { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .sec-btn {
        display: flex; align-items: center; gap: 11px; width: 100%;
        padding: 10px 12px; border-radius: 10px;
        font-family: inherit; font-size: 13.5px; font-weight: 700; text-align: left;
        color: #94a3b8; background: transparent; border: 1px solid transparent;
        cursor: pointer; transition: background 0.12s ease, color 0.12s ease;
    }
    .sec-btn:hover { color: #e2e8f0; background: rgba(51, 65, 85, 0.28); }
    .nav-on, .nav-on:hover { color: #fff; background: rgba(99, 102, 241, 0.16); border-color: rgba(129, 140, 248, 0.22); }
    .nav-on :global(.ico) { color: #a5b4fc; }
    .nav-label { flex: 1; white-space: nowrap; }
    .nav-short { display: none; }
    .nav-dot { width: 7px; height: 7px; border-radius: 50%; background: #475569; flex-shrink: 0; }
    .nav-dot-on { background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); }
    .nav-foot { padding: 12px 10px 0; font-size: 11px; font-weight: 700; color: #475569; }

    /* ── Page ── */
    .main { display: flex; flex-direction: column; min-height: 0; }
    .head {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
        padding: 22px 26px 18px;
        border-bottom: 1px solid rgba(100, 116, 139, 0.14);
    }
    .head-title { margin: 0; font-size: 20px; font-weight: 900; color: #f1f5f9; letter-spacing: -0.2px; }
    .head-desc { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
    .x {
        width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        color: #94a3b8; background: rgba(51, 65, 85, 0.3); border: 1px solid rgba(100, 116, 139, 0.22);
        cursor: pointer; transition: all 0.12s ease;
    }
    .x:hover { color: #fff; background: rgba(71, 85, 105, 0.45); }
    .body { flex: 1; overflow-y: auto; padding: 20px 26px 26px; display: flex; flex-direction: column; gap: 18px; }

    /* Groups + rows */
    .group {
        border: 1px solid rgba(100, 116, 139, 0.18); border-radius: 14px;
        background: rgba(15, 23, 42, 0.45);
        overflow: hidden;
    }
    .group-title {
        padding: 12px 18px 0;
        font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #64748b;
    }
    .row {
        display: flex; align-items: center; justify-content: space-between; gap: 20px;
        padding: 16px 18px;
    }
    .row + .row { border-top: 1px solid rgba(100, 116, 139, 0.12); }
    .row-stack { flex-direction: column; align-items: stretch; gap: 14px; }
    .row-off { opacity: 0.55; }
    .row-text { min-width: 0; }
    .row-label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: #e2e8f0; }
    .row-desc { margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: #8b9ab0; }
    .tag {
        font-size: 9.5px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;
        color: #fbbf24; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.28);
        padding: 1px 6px; border-radius: 6px;
    }
    .note { font-size: 12px; line-height: 1.5; color: #8b9ab0; }
    .note-warn { color: #fbbf24; }

    /* Switch */
    .sw {
        position: relative; flex-shrink: 0;
        width: 46px; height: 26px; border-radius: 999px; padding: 0;
        background: #334155; border: 1px solid rgba(148, 163, 184, 0.2);
        cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease;
    }
    .knob {
        position: absolute; top: 2px; left: 2px;
        width: 20px; height: 20px; border-radius: 50%;
        background: #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        transition: transform 0.15s ease;
    }
    .sw-on { background: #6366f1; border-color: #818cf8; }
    .sw-on .knob { transform: translateX(20px); background: #fff; }

    /* Segmented control */
    .seg {
        display: inline-flex; flex-shrink: 0; padding: 3px; gap: 2px;
        background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(100, 116, 139, 0.22); border-radius: 10px;
    }
    .seg button {
        padding: 7px 14px; border-radius: 8px; border: none;
        font-family: inherit; font-size: 12.5px; font-weight: 800;
        color: #94a3b8; background: transparent; cursor: pointer; white-space: nowrap;
        transition: background 0.12s ease, color 0.12s ease;
    }
    .seg button:hover { color: #e2e8f0; }
    .seg .seg-on, .seg .seg-on:hover { color: #fff; background: #4f46e5; box-shadow: 0 2px 8px rgba(79, 70, 229, 0.35); }
    .seg-wide { display: flex; }
    .seg-wide button { flex: 1; padding: 9px 14px; }

    /* Buttons */
    .btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex-shrink: 0;
        padding: 9px 16px; border-radius: 10px;
        font-family: inherit; font-size: 13px; font-weight: 800; white-space: nowrap;
        color: #e2e8f0; background: rgba(51, 65, 85, 0.45); border: 1px solid rgba(100, 116, 139, 0.3);
        cursor: pointer; transition: all 0.12s ease;
    }
    .btn:hover:not(:disabled) { background: rgba(71, 85, 105, 0.55); border-color: rgba(148, 163, 184, 0.4); }
    .btn:disabled { opacity: 0.55; cursor: wait; }
    .btn-accent { color: #fff; background: #4f46e5; border-color: #6366f1; }
    .btn-accent:hover:not(:disabled) { background: #5b52f0; border-color: #818cf8; }
    .btn-quiet { background: transparent; }
    .btn-destroy { color: #fecaca; background: rgba(185, 28, 28, 0.25); border-color: rgba(239, 68, 68, 0.4); }
    .btn-destroy:hover:not(:disabled) { background: rgba(185, 28, 28, 0.42); border-color: rgba(248, 113, 113, 0.6); }
    .btn-block { width: 100%; padding: 11px 16px; }
    .btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn-row .btn { flex: 1; min-width: 150px; }
    .link {
        align-self: center; margin-top: 2px;
        font-family: inherit; font-size: 12.5px; font-weight: 700; color: #94a3b8;
        background: none; border: none; cursor: pointer;
    }
    .link:hover { color: #c7d2fe; text-decoration: underline; }

    /* Account */
    .profile {
        display: flex; align-items: center; gap: 14px;
        padding: 16px 18px; border-radius: 14px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(100, 116, 139, 0.18);
    }
    .avatar {
        width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 19px; font-weight: 900; color: #fff;
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
    }
    .profile-text { flex: 1; min-width: 0; }
    .profile-name { font-size: 16px; font-weight: 900; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .profile-email { margin-top: 2px; font-size: 12.5px; color: #8b9ab0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chip { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 800; }
    .chip-ok { color: #6ee7b7; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); }
    .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
    .guest {
        display: flex; gap: 14px; align-items: flex-start;
        padding: 16px 18px; border-radius: 14px;
        background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(129, 140, 248, 0.22);
    }
    .guest-ico {
        width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        color: #c7d2fe; background: rgba(99, 102, 241, 0.16);
    }
    .form { display: flex; flex-direction: column; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .field input, .code-input {
        width: 100%; padding: 11px 14px; border-radius: 10px;
        font-family: inherit; font-size: 14px; color: #f1f5f9;
        background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(100, 116, 139, 0.32);
        outline: none; transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .field input:focus, .code-input:focus { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18); }
    .field input::placeholder, .code-input::placeholder { color: #475569; }

    /* Volume */
    .vol { display: flex; align-items: center; gap: 10px; flex-shrink: 0; color: #94a3b8; }
    .vol input[type="range"] {
        -webkit-appearance: none; appearance: none;
        width: 180px; height: 6px; border-radius: 999px; cursor: pointer;
        background: linear-gradient(to right, #6366f1 var(--fill), #334155 var(--fill));
    }
    .vol input[type="range"]:disabled { cursor: not-allowed; }
    .vol input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 18px; height: 18px; border-radius: 50%;
        background: #fff; border: 2px solid #6366f1; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    }
    .vol input[type="range"]::-moz-range-thumb {
        width: 14px; height: 14px; border-radius: 50%;
        background: #fff; border: 2px solid #6366f1;
    }
    .vol-n { width: 40px; text-align: right; font-size: 12.5px; font-weight: 800; color: #e2e8f0; font-variant-numeric: tabular-nums; }

    /* Codes */
    .code-row { display: flex; gap: 10px; }
    .code-input { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .code-input::placeholder { text-transform: none; letter-spacing: 0; font-family: inherit; font-weight: 500; }
    .codes { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 18px 16px; }
    .code-chip {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 5px 10px; border-radius: 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; font-weight: 700;
        color: #a7f3d0; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25);
    }

    /* Danger */
    .group-danger { border-color: rgba(239, 68, 68, 0.28); background: rgba(127, 29, 29, 0.08); }
    .group-danger .group-title { color: #f87171; }

    /* ── Phone: the sidebar becomes a row of tabs above the page ── */
    @media (max-width: 720px) {
        .overlay { padding: 0; align-items: stretch; }
        .sp {
            max-width: none; height: 100%; border-radius: 0; border: none;
            grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr);
        }
        .nav { flex-direction: row; padding: 8px 8px; border-right: none; border-bottom: 1px solid rgba(100, 116, 139, 0.16); }
        .brand, .nav-foot, .nav-label { display: none; }
        .nav-list { flex-direction: row; gap: 4px; }
        .sec-btn { position: relative; flex: 1 1 0; min-width: 0; flex-direction: column; gap: 4px; padding: 8px 2px 7px; }
        .nav-short { display: block; font-size: 11px; font-weight: 800; white-space: nowrap; }
        .nav-dot { position: absolute; top: 7px; right: calc(50% - 16px); }
        .head { padding: 16px 16px 14px; }
        .body { padding: 16px 16px 24px; gap: 14px; }
        .row { flex-wrap: wrap; gap: 12px; padding: 14px 16px; }
        .row-text { flex: 1 1 220px; }
        .vol { width: 100%; }
        .vol input[type="range"] { flex: 1; width: auto; }
    }
</style>
