<script>
    import { showAuthPanel, soundMuted, lightMode, toggleLightMode, openConfirmModal } from '../../stores/ui.js';
    import { currentUser, authLoading, signIn, register, signOut, cloudSave, cloudLoad, resetPassword } from '../../stores/auth.js';
    import { showToast } from '../../stores/toasts.js';
    import { toggleMute } from '../../utils/sound.js';
    import { club } from '../../stores/game.js';
    import { clearStorage } from '../../utils/storage.js';

    let view = 'signin'; // signin | register | settings
    let email = '';
    let password = '';
    let regName = '';
    let regEmail = '';
    let regPass = '';

    function handleMute() {
        const muted = toggleMute();
        soundMuted.set(muted);
    }

    function close() {
        showAuthPanel.set(false);
        view = 'signin';
    }

    function wipeAccount() {
        openConfirmModal('This will erase ALL local data — cards, squad, progress, quests, everything. You cannot undo this.', () => {
            clearStorage();
            showToast('Account wiped. Reloading...', 'info');
            setTimeout(() => location.reload(), 800);
        });
    }

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

    $: isSignedIn = $currentUser !== null;
</script>

{#if $showAuthPanel}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="overlay" on:click|self={close}>
    <div class="modal">
        <!-- Close button -->
        <button class="close-btn" on:click={close}>✕</button>

        {#if isSignedIn}
            <!-- === SIGNED IN VIEW === -->
            <div class="tabs">
                <button class="tab" class:tab-on={view !== 'settings'} on:click={() => view = 'account'}>Account</button>
                <button class="tab" class:tab-on={view === 'settings'} on:click={() => view = 'settings'}>Settings</button>
            </div>

            <div class="body">
                {#if view === 'settings'}
                    <!-- SETTINGS -->
                    <div class="section-title">Settings</div>
                    <div class="settings-list">
                        <div class="setting">
                            <div><div class="s-title">{$lightMode ? '☀️' : '🌙'} Theme</div><div class="s-desc">{$lightMode ? 'Light mode' : 'Dark mode'}</div></div>
                            <button class="toggle {$lightMode ? 't-yellow' : 't-slate'}" on:click={toggleLightMode}>{$lightMode ? 'Light' : 'Dark'}</button>
                        </div>
                        <div class="setting">
                            <div><div class="s-title">{$soundMuted ? '🔇' : '🔊'} Sound</div><div class="s-desc">{$soundMuted ? 'Muted' : 'Enabled'}</div></div>
                            <button class="toggle {$soundMuted ? 't-red' : 't-green'}" on:click={handleMute}>{$soundMuted ? 'Off' : 'On'}</button>
                        </div>
                    </div>
                    <div class="wipe-section">
                        <div class="wipe-label">Danger Zone</div>
                        <button class="wipe-btn" on:click={wipeAccount}>🗑️ Wipe All Local Data</button>
                        <div class="wipe-hint">Erases everything — cards, squad, progress, quests. Cannot be undone.</div>
                    </div>
                {:else}
                    <!-- ACCOUNT INFO -->
                    <div class="user-card">
                        <div class="user-avatar">👤</div>
                        <div class="user-info">
                            <div class="user-name">{$currentUser.displayName || 'Manager'}</div>
                            <div class="user-email">{$currentUser.email}</div>
                        </div>
                    </div>

                    <div class="cloud-actions">
                        <button class="cloud-btn save" on:click={cloudSave} disabled={$authLoading}>
                            {$authLoading ? '...' : '☁️ Save to Cloud'}
                        </button>
                        <button class="cloud-btn load" on:click={cloudLoad} disabled={$authLoading}>
                            {$authLoading ? '...' : '📥 Load from Cloud'}
                        </button>
                    </div>

                    <div class="cloud-note">
                        Loads cards, squad, BE, stats, and progress from the old website too.
                        <br>Your club has <strong>{$club.length}</strong> cards locally.
                    </div>

                    <button class="signout-btn" on:click={handleSignOut}>Sign Out</button>
                {/if}
            </div>

        {:else}
            <!-- === SIGNED OUT VIEW === -->
            <div class="tabs">
                <button class="tab" class:tab-on={view === 'signin'} on:click={() => view = 'signin'}>Sign In</button>
                <button class="tab" class:tab-on={view === 'register'} on:click={() => view = 'register'}>Register</button>
                <button class="tab" class:tab-on={view === 'settings'} on:click={() => view = 'settings'}>Settings</button>
            </div>

            <div class="body">
                {#if view === 'signin'}
                    <div class="section-title">Welcome Back</div>
                    <p class="section-desc">Sign in to sync progress across devices.</p>
                    <input type="email" placeholder="Email" class="field" bind:value={email} on:keydown={e => e.key === 'Enter' && handleSignIn()}>
                    <input type="password" placeholder="Password" class="field" bind:value={password} on:keydown={e => e.key === 'Enter' && handleSignIn()}>
                    <button class="primary-btn" on:click={handleSignIn} disabled={$authLoading}>
                        {$authLoading ? 'Signing in...' : 'Sign In'}
                    </button>
                    <button class="reset-link" on:click={() => resetPassword(email)}>
                        Forgot password?
                    </button>

                {:else if view === 'register'}
                    <div class="section-title">Create Account</div>
                    <p class="section-desc">Set up your manager profile.</p>
                    <input type="text" placeholder="Display Name" class="field" bind:value={regName}>
                    <input type="email" placeholder="Email" class="field" bind:value={regEmail}>
                    <input type="password" placeholder="Password (min 6 chars)" class="field" bind:value={regPass} on:keydown={e => e.key === 'Enter' && handleRegister()}>
                    <button class="success-btn" on:click={handleRegister} disabled={$authLoading}>
                        {$authLoading ? 'Creating...' : 'Create Account'}
                    </button>

                {:else}
                    <div class="section-title">Settings</div>
                    <div class="settings-list">
                        <div class="setting">
                            <div><div class="s-title">{$lightMode ? '☀️' : '🌙'} Theme</div><div class="s-desc">{$lightMode ? 'Light mode' : 'Dark mode'}</div></div>
                            <button class="toggle {$lightMode ? 't-yellow' : 't-slate'}" on:click={toggleLightMode}>{$lightMode ? 'Light' : 'Dark'}</button>
                        </div>
                        <div class="setting">
                            <div><div class="s-title">{$soundMuted ? '🔇' : '🔊'} Sound</div><div class="s-desc">{$soundMuted ? 'Muted' : 'Enabled'}</div></div>
                            <button class="toggle {$soundMuted ? 't-red' : 't-green'}" on:click={handleMute}>{$soundMuted ? 'Off' : 'On'}</button>
                        </div>
                    </div>
                    <div class="wipe-section">
                        <div class="wipe-label">Danger Zone</div>
                        <button class="wipe-btn" on:click={wipeAccount}>🗑️ Wipe All Local Data</button>
                        <div class="wipe-hint">Erases everything — cards, squad, progress, quests. Cannot be undone.</div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
{/if}

<style>
    .overlay {
        position: fixed; inset: 0; z-index: 100;
        background: rgba(0,0,0,0.75);
        backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
    }
    .modal {
        width: 100%; max-width: 420px; position: relative;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 20px;
        box-shadow: 0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(79,70,229,0.05);
        overflow: hidden;
    }

    /* Close */
    .close-btn {
        position: absolute; top: 12px; right: 14px; z-index: 10;
        width: 32px; height: 32px; border-radius: 10px;
        background: rgba(51,65,85,0.3); border: 1px solid rgba(71,85,105,0.2);
        color: #64748b; font-size: 14px; font-weight: 700;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all 0.12s ease;
    }
    .close-btn:hover { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.2); }

    /* Tabs */
    .tabs {
        display: flex; border-bottom: 1px solid rgba(51,65,85,0.2);
        background: rgba(15,23,42,0.3);
    }
    .tab {
        flex: 1; padding: 14px 12px;
        font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
        color: #475569; background: transparent; border: none; border-bottom: 2px solid transparent;
        cursor: pointer; transition: all 0.12s ease;
    }
    .tab:hover { color: #94a3b8; }
    .tab-on { color: #93c5fd !important; border-color: #3b82f6; background: rgba(59,130,246,0.03); }

    /* Body */
    .body { padding: 24px; }

    .section-title {
        font-size: 20px; font-weight: 900; color: #e2e8f0;
        text-align: center; margin-bottom: 4px;
    }
    .section-desc {
        font-size: 11px; color: #475569; text-align: center; margin-bottom: 20px;
    }

    /* Fields */
    .field {
        width: 100%; padding: 12px 16px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.35);
        border-radius: 12px; color: #e2e8f0; font-size: 13px;
        font-family: inherit; outline: none; margin-bottom: 10px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .field:focus {
        border-color: rgba(59,130,246,0.4);
        box-shadow: 0 0 0 3px rgba(59,130,246,0.08);
    }
    .field::placeholder { color: #334155; }

    /* Buttons */
    .primary-btn {
        width: 100%; padding: 12px;
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        color: white; font-weight: 900; font-size: 13px;
        border: none; border-radius: 12px; cursor: pointer;
        box-shadow: 0 4px 15px rgba(59,130,246,0.25);
        transition: all 0.15s ease;
    }
    .primary-btn:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(59,130,246,0.4); transform: translateY(-1px); }
    .primary-btn:disabled { opacity: 0.5; cursor: wait; }

    .reset-link {
        display: block; width: 100%; margin-top: 10px;
        background: none; border: none; cursor: pointer;
        font-size: 11px; font-weight: 700; color: #64748b;
        text-align: center; transition: color 0.12s;
    }
    .reset-link:hover { color: #93c5fd; }

    .success-btn {
        width: 100%; padding: 12px;
        background: linear-gradient(135deg, #059669, #10b981);
        color: white; font-weight: 900; font-size: 13px;
        border: none; border-radius: 12px; cursor: pointer;
        box-shadow: 0 4px 15px rgba(16,185,129,0.2);
        transition: all 0.15s ease;
    }
    .success-btn:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(16,185,129,0.35); transform: translateY(-1px); }
    .success-btn:disabled { opacity: 0.5; cursor: wait; }

    /* Signed-in user card */
    .user-card {
        display: flex; align-items: center; gap: 14px;
        padding: 16px; border-radius: 14px; margin-bottom: 20px;
        background: linear-gradient(135deg, rgba(30,41,59,0.5), rgba(15,23,42,0.6));
        border: 1px solid rgba(71,85,105,0.2);
    }
    .user-avatar {
        width: 48px; height: 48px; border-radius: 14px;
        background: rgba(79,70,229,0.12); border: 1px solid rgba(99,102,241,0.2);
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; flex-shrink: 0;
    }
    .user-info { min-width: 0; }
    .user-name { font-size: 16px; font-weight: 900; color: #e2e8f0; }
    .user-email { font-size: 11px; color: #64748b; margin-top: 2px; word-break: break-all; }

    /* Cloud actions */
    .cloud-actions { display: flex; gap: 10px; margin-bottom: 14px; }
    .cloud-btn {
        flex: 1; padding: 12px 8px;
        border-radius: 12px; font-size: 12px; font-weight: 800;
        cursor: pointer; border: 1px solid; transition: all 0.12s ease;
        text-align: center;
    }
    .cloud-btn:disabled { opacity: 0.5; cursor: wait; }
    .cloud-btn.save {
        background: rgba(16,185,129,0.08); color: #34d399; border-color: rgba(16,185,129,0.2);
    }
    .cloud-btn.save:hover:not(:disabled) { background: rgba(16,185,129,0.15); }
    .cloud-btn.load {
        background: rgba(59,130,246,0.08); color: #60a5fa; border-color: rgba(59,130,246,0.2);
    }
    .cloud-btn.load:hover:not(:disabled) { background: rgba(59,130,246,0.15); }

    .cloud-note {
        font-size: 10px; color: #475569; text-align: center;
        padding: 10px 12px; border-radius: 10px; margin-bottom: 16px;
        background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15);
        line-height: 1.5;
    }
    .cloud-note strong { color: #94a3b8; }

    .signout-btn {
        width: 100%; padding: 10px;
        background: transparent; color: #ef4444; font-size: 12px; font-weight: 700;
        border: 1px solid rgba(239,68,68,0.15); border-radius: 10px;
        cursor: pointer; transition: all 0.12s ease;
    }
    .signout-btn:hover { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.3); }

    /* Settings */
    .settings-list { display: flex; flex-direction: column; gap: 10px; }
    .setting {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px; border-radius: 14px;
        background: rgba(15,23,42,0.35); border: 1px solid rgba(51,65,85,0.2);
    }
    .s-title { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .s-desc { font-size: 10px; color: #475569; margin-top: 2px; }
    .toggle {
        padding: 6px 18px; border-radius: 8px;
        font-size: 11px; font-weight: 800; cursor: pointer;
        border: 1px solid; transition: all 0.12s ease;
    }
    .t-slate { background: rgba(51,65,85,0.3); color: #94a3b8; border-color: rgba(71,85,105,0.25); }
    .t-yellow { background: rgba(234,179,8,0.1); color: #fbbf24; border-color: rgba(234,179,8,0.2); }
    .t-green { background: rgba(16,185,129,0.1); color: #34d399; border-color: rgba(16,185,129,0.15); }
    .t-red { background: rgba(239,68,68,0.08); color: #f87171; border-color: rgba(239,68,68,0.15); }

    /* Wipe / Danger Zone */
    .wipe-section {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid rgba(239,68,68,0.1);
    }
    .wipe-label {
        font-size: 10px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #ef4444; margin-bottom: 10px;
    }
    .wipe-btn {
        width: 100%; padding: 11px;
        background: rgba(127,29,29,0.2); color: #f87171;
        font-size: 12px; font-weight: 800;
        border: 1px solid rgba(239,68,68,0.2); border-radius: 10px;
        cursor: pointer; transition: all 0.12s ease;
    }
    .wipe-btn:hover { background: rgba(127,29,29,0.4); border-color: rgba(239,68,68,0.4); }
    .wipe-hint {
        font-size: 9px; color: #475569; text-align: center;
        margin-top: 6px; line-height: 1.4;
    }
</style>
