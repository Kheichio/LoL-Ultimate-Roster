import { writable, get } from 'svelte/store';
import { currentUser } from './auth.js';
import { teamIdentity } from './game.js';
import { showToast } from './toasts.js';

// Raw friendship edge docs involving the current user (pending + accepted).
export const friendships = writable([]);
// Count of incoming pending requests — drives the header badge.
export const friendRequestCount = writable(0);

// Deterministic doc id for a pair, so both users resolve the same edge.
export function pairId(a, b) { return [a, b].sort().join('_'); }
export function otherUid(f, myUid) { return (f.users || []).find(u => u !== myUid); }

// Live listener: re-subscribes whenever the signed-in user changes.
let unsub = null;
currentUser.subscribe(user => {
    if (unsub) { unsub(); unsub = null; }
    friendships.set([]);
    friendRequestCount.set(0);
    if (user && window.fbDb) {
        try {
            unsub = window.fbDb.collection('friendships')
                .where('users', 'array-contains', user.uid)
                .onSnapshot(snap => {
                    const docs = [];
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                    friendships.set(docs);
                    friendRequestCount.set(docs.filter(f => f.status === 'pending' && f.requester !== user.uid).length);
                }, () => { /* denied / offline — leave empty */ });
        } catch (e) { /* ignore */ }
    }
});

// Search the public leaderboard by exact display name.
export async function searchUsers(query) {
    if (!window.fbDb || !query) return [];
    try {
        const snap = await window.fbDb.collection('leaderboard').where('displayName', '==', query.trim()).limit(10).get();
        const me = get(currentUser)?.uid;
        const out = [];
        snap.forEach(d => {
            if (d.id === me) return;
            const x = d.data();
            out.push({ uid: d.id, displayName: x.displayName || 'Unknown', teamName: x.teamName || 'Team', teamLogo: x.teamLogo || '🛡️', trophies: x.trophies || 0, totalPower: x.totalPower || 0 });
        });
        return out;
    } catch (e) { showToast('Search failed: ' + e.message, 'error'); return []; }
}

export async function sendFriendRequest(target) {
    const user = get(currentUser);
    if (!user || !window.fbDb) { showToast('Sign in first.', 'error'); return; }
    if (!target || target.uid === user.uid) { showToast("You can't add yourself.", 'error'); return; }
    const id = pairId(user.uid, target.uid);
    const ti = get(teamIdentity);
    const doc = {
        users: [user.uid, target.uid],
        requester: user.uid,
        status: 'pending',
        profiles: {
            [user.uid]: { name: user.displayName || 'Manager', team: ti.name || 'My Team', logo: ti.logo || '🛡️' },
            [target.uid]: { name: target.displayName, team: target.teamName, logo: target.teamLogo },
        },
        createdAt: Date.now(),
    };
    try {
        const existing = await window.fbDb.collection('friendships').doc(id).get();
        if (existing.exists) { showToast('Already friends or a request is pending.', 'info'); return; }
        await window.fbDb.collection('friendships').doc(id).set(doc);
        showToast(`Friend request sent to ${target.displayName}.`, 'success');
    } catch (e) { showToast('Could not send request: ' + e.message, 'error'); }
}

export async function acceptRequest(id) {
    const user = get(currentUser);
    if (!user || !window.fbDb) return;
    try {
        await window.fbDb.collection('friendships').doc(id).update({ status: 'accepted', updatedAt: Date.now() });
        showToast('Friend added!', 'success');
    } catch (e) { showToast('Could not accept: ' + e.message, 'error'); }
}

// Decline a request, cancel an outgoing request, or remove a friend — all delete the edge.
export async function removeFriendship(id) {
    const user = get(currentUser);
    if (!user || !window.fbDb) return;
    try { await window.fbDb.collection('friendships').doc(id).delete(); }
    catch (e) { showToast('Action failed: ' + e.message, 'error'); }
}
