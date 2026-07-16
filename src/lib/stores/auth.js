import { writable, get } from 'svelte/store';
import { club, squad, blueEssence, trackStats, teamIdentity, managerXP, managerLevel, skillPoints, skills, collectionRegistry, unlocks, seasonData, battlePass, hasBoughtStarter, questsClaimed, questsRepeatableBaselines, questsRepeatableCounts, achievementsClaimed, academy, saveGame } from './game.js';
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

    const data = {
        lol_be_v7_pro: JSON.stringify(get(blueEssence)),
        lol_club_v7_pro: JSON.stringify(get(club)),
        lol_squad_v7_pro: JSON.stringify(get(squad)),
        lol_starter_v7_pro: JSON.stringify(get(hasBoughtStarter)),
        lol_identity_v7_pro: JSON.stringify(get(teamIdentity)),
        lol_stats_v7_pro: JSON.stringify(get(trackStats)),
        lol_collection_v7_pro: JSON.stringify(get(collectionRegistry)),
        lol_unlocks_v1: JSON.stringify(get(unlocks)),
        lol_season_v1: JSON.stringify(get(seasonData)),
        lol_battlepass_v1: JSON.stringify(get(battlePass)),
        lol_prog_v7_pro: JSON.stringify({ xp: get(managerXP), level: get(managerLevel), sp: get(skillPoints), skills: get(skills) }),
        lol_quests_claimed_v1: JSON.stringify(get(questsClaimed)),
        lol_quests_rbase_v1: JSON.stringify(get(questsRepeatableBaselines)),
        lol_quests_rcounts_v1: JSON.stringify(get(questsRepeatableCounts)),
        lol_achievements_v1: JSON.stringify(get(achievementsClaimed)),
        lol_academy_v1: JSON.stringify(get(academy)),
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

        // Load v1 format data
        if (data.lol_be_v7_pro) blueEssence.set(Number(JSON.parse(data.lol_be_v7_pro)));
        if (data.lol_club_v7_pro) club.set(JSON.parse(data.lol_club_v7_pro));
        if (data.lol_squad_v7_pro) squad.set(JSON.parse(data.lol_squad_v7_pro));
        if (data.lol_starter_v7_pro) {
            const val = JSON.parse(data.lol_starter_v7_pro);
            hasBoughtStarter.set(val === true || val === 'true');
        }
        if (data.lol_identity_v7_pro) teamIdentity.set(JSON.parse(data.lol_identity_v7_pro));
        if (data.lol_stats_v7_pro) trackStats.set({ ...get(trackStats), ...JSON.parse(data.lol_stats_v7_pro) });
        if (data.lol_collection_v7_pro) collectionRegistry.set(JSON.parse(data.lol_collection_v7_pro));
        if (data.lol_unlocks_v1) unlocks.set({ ...get(unlocks), ...JSON.parse(data.lol_unlocks_v1) });
        if (data.lol_season_v1) seasonData.set({ ...get(seasonData), ...JSON.parse(data.lol_season_v1) });
        if (data.lol_battlepass_v1) battlePass.set({ ...get(battlePass), ...JSON.parse(data.lol_battlepass_v1) });
        if (data.lol_prog_v7_pro) {
            const prog = JSON.parse(data.lol_prog_v7_pro);
            if (prog.xp != null) managerXP.set(prog.xp);
            if (prog.level != null) managerLevel.set(prog.level);
            if (prog.sp != null) skillPoints.set(prog.sp);
            if (prog.skills) skills.set({ ...get(skills), ...prog.skills });
        }

        if (data.lol_quests_claimed_v1) questsClaimed.set(JSON.parse(data.lol_quests_claimed_v1));
        if (data.lol_quests_rbase_v1) questsRepeatableBaselines.set(JSON.parse(data.lol_quests_rbase_v1));
        if (data.lol_quests_rcounts_v1) questsRepeatableCounts.set(JSON.parse(data.lol_quests_rcounts_v1));
        if (data.lol_achievements_v1) achievementsClaimed.set(JSON.parse(data.lol_achievements_v1));
        if (data.lol_academy_v1) academy.set({ ...get(academy), ...JSON.parse(data.lol_academy_v1) });

        saveGame();
        showToast(`Cloud data loaded! (${get(club).length} cards)`, 'success');
    } catch (e) {
        showToast('Cloud load failed: ' + e.message, 'error');
    }
    authLoading.set(false);
}
