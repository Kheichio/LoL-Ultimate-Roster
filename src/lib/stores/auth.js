import { writable, get } from 'svelte/store';
import { club, teamIdentity, snapshotState, applyState } from './game.js';
import { showToast } from './toasts.js';

export const currentUser = writable(null);
export const authLoading = writable(false);

// Listen for auth changes
if (window.fbAuth) {
    window.fbAuth.onAuthStateChanged(user => {
        currentUser.set(user);
    });
}

export async function signIn(email, password) {
    if (!window.fbAuth) { showToast('Firebase not available.', 'error'); return false; }
    authLoading.set(true);
    try {
        await window.fbAuth.signInWithEmailAndPassword(email, password);
        showToast('Signed in!', 'success');
        authLoading.set(false);
        return true;
    } catch (e) {
        showToast(e.message.replace('Firebase: ', ''), 'error');
        authLoading.set(false);
        return false;
    }
}

export async function register(name, email, password) {
    if (!window.fbAuth) { showToast('Firebase not available.', 'error'); return false; }
    authLoading.set(true);
    try {
        const cred = await window.fbAuth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        showToast('Account created!', 'success');
        authLoading.set(false);
        return true;
    } catch (e) {
        showToast(e.message.replace('Firebase: ', ''), 'error');
        authLoading.set(false);
        return false;
    }
}

export async function signOut() {
    if (!window.fbAuth) return;
    await window.fbAuth.signOut();
    currentUser.set(null);
    showToast('Signed out.', 'info');
}

export async function resetPassword(email) {
    if (!window.fbAuth) { showToast('Firebase not available.', 'error'); return false; }
    if (!email) { showToast('Enter your email address first.', 'error'); return false; }
    try {
        await window.fbAuth.sendPasswordResetEmail(email);
        showToast('Password reset email sent! Check your inbox.', 'success');
        return true;
    } catch (e) {
        showToast(e.message.replace('Firebase: ', ''), 'error');
        return false;
    }
}

export async function cloudSave() {
    const user = get(currentUser);
    if (!user || !window.fbDb) { showToast('Sign in first.', 'error'); return; }
    authLoading.set(true);

    // v2 format — one JSON blob of the full store snapshot, so cloud always carries
    // exactly what local persists (no dropped stores) and stays in sync automatically.
    const data = {
        v: 2,
        save: JSON.stringify(snapshotState()),
        savedAt: Date.now(),
        teamName: get(teamIdentity).name || 'My Team',
    };

    try {
        await window.fbDb.collection('saves').doc(user.uid).set(data);
        showToast('Saved to cloud!', 'success');
    } catch (e) {
        showToast('Cloud save failed: ' + e.message, 'error');
    }
    authLoading.set(false);
}

export async function cloudLoad() {
    const user = get(currentUser);
    if (!user || !window.fbDb) { showToast('Sign in first.', 'error'); return; }
    authLoading.set(true);

    try {
        const doc = await window.fbDb.collection('saves').doc(user.uid).get();
        if (!doc.exists) { showToast('No cloud save found.', 'info'); authLoading.set(false); return; }
        const data = doc.data();

        let state = null;
        if (data.save) {
            // v2 format — a full snapshot of every store
            try { state = JSON.parse(data.save); } catch { state = null; }
        } else if (data.lol_be_v7_pro || data.lol_club_v7_pro) {
            // Legacy v1 cloud format — remap the old keys into the current snapshot shape
            const P = (s) => { try { return s == null ? undefined : JSON.parse(s); } catch { return undefined; } };
            state = {
                lur_be: P(data.lol_be_v7_pro),
                lur_club: P(data.lol_club_v7_pro),
                lur_squad: P(data.lol_squad_v7_pro),
                lur_starter: P(data.lol_starter_v7_pro),
                lur_identity: P(data.lol_identity_v7_pro),
                lur_stats: P(data.lol_stats_v7_pro),
                lur_collection: P(data.lol_collection_v7_pro),
                lur_unlocks: P(data.lol_unlocks_v1),
                lur_season: P(data.lol_season_v1),
                lur_battlepass: P(data.lol_battlepass_v1),
                lur_progression: P(data.lol_prog_v7_pro),
                lur_quests_claimed: P(data.lol_quests_claimed_v1),
                lur_quests_rbase: P(data.lol_quests_rbase_v1),
                lur_quests_rcounts: P(data.lol_quests_rcounts_v1),
                lur_achievements_claimed: P(data.lol_achievements_v1),
                lur_academy: P(data.lol_academy_v1),
                lur_matchhistory: P(data.lol_matchhistory_v1),
            };
        }

        if (!state) { showToast('No readable cloud save found.', 'info'); authLoading.set(false); return; }

        // Route through localStorage + initGame() so every card is validated/clamped
        // exactly like a local load — no unvalidated writes, no dropped stores.
        applyState(state);
        showToast(`Cloud data loaded! (${get(club).length} cards)`, 'success');
    } catch (e) {
        showToast('Cloud load failed: ' + e.message, 'error');
    }
    authLoading.set(false);
}
