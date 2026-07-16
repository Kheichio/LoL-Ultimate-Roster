<script>
    import ProfileModal from '../modals/ProfileModal.svelte';
    import { currentUser } from '../../stores/auth.js';
    import { friendships, searchUsers, sendFriendRequest, acceptRequest, removeFriendship, otherUid } from '../../stores/friends.js';
    import { pendingChallenge, switchTab, showAuthPanel } from '../../stores/ui.js';
    import { showToast } from '../../stores/toasts.js';

    $: myUid = $currentUser?.uid;
    $: incoming = $friendships.filter(f => f.status === 'pending' && f.requester !== myUid);
    $: outgoing = $friendships.filter(f => f.status === 'pending' && f.requester === myUid);
    $: friends = $friendships.filter(f => f.status === 'accepted');

    function profOf(f) { return (f.profiles && f.profiles[otherUid(f, myUid)]) || { name: 'Manager', team: 'Team', logo: '🛡️' }; }

    let searchQuery = '';
    let searchResults = [];
    let searching = false;
    let selectedPlayer = null;

    async function doSearch() {
        if (!searchQuery.trim()) { searchResults = []; return; }
        searching = true;
        searchResults = await searchUsers(searchQuery);
        searching = false;
    }

    function alreadyKnown(uid) {
        return $friendships.some(f => (f.users || []).includes(uid));
    }

    async function viewFriend(f) {
        const uid = otherUid(f, myUid);
        if (!window.fbDb) return;
        try {
            const snap = await window.fbDb.collection('leaderboard').doc(uid).get();
            if (!snap.exists) { showToast('No public profile yet — they need to sync to the leaderboard.', 'info'); return; }
            const d = snap.data();
            selectedPlayer = { id: uid, ...d, squad: d.squadData || {}, showcaseCards: d.showcaseData || [] };
        } catch (e) { showToast('Could not load profile: ' + e.message, 'error'); }
    }

    async function challengeFriend(f) {
        const uid = otherUid(f, myUid);
        if (!window.fbDb) return;
        try {
            const snap = await window.fbDb.collection('leaderboard').doc(uid).get();
            if (!snap.exists) { showToast('No squad to challenge yet.', 'info'); return; }
            const d = snap.data();
            if (!d.squadData || Object.keys(d.squadData).length < 4) { showToast('This friend has no full squad synced yet.', 'error'); return; }
            pendingChallenge.set({ id: uid, displayName: d.displayName || 'Friend', teamName: d.teamName || 'Team', teamLogo: d.teamLogo || '🛡️', totalPower: d.totalPower || 0, trophies: d.trophies || 0, squadData: d.squadData });
            switchTab('tournament');
        } catch (e) { showToast('Could not start challenge: ' + e.message, 'error'); }
    }
</script>

<section class="fr">
    <div class="fr-head">
        <h2 class="fr-title">Friends</h2>
        <p class="fr-sub">Add managers, view their squads, and challenge them directly.</p>
    </div>

    {#if !$currentUser}
        <div class="fr-signin">
            <div class="fr-signin-ico">🤝</div>
            <p class="fr-signin-t">Sign in to add friends</p>
            <p class="fr-signin-p">The friend system uses your cloud account. Sign in to send requests, build your friends list, and challenge friends.</p>
            <button class="fr-btn fr-btn-primary" on:click={() => showAuthPanel.set(true)}>Sign In</button>
        </div>
    {:else}
        <!-- Add Friend -->
        <div class="fr-panel">
            <div class="fr-panel-label">Add a Friend</div>
            <div class="fr-search">
                <input type="text" class="input fr-input" bind:value={searchQuery} placeholder="Search by exact manager name..." on:keydown={(e) => e.key === 'Enter' && doSearch()}>
                <button class="fr-btn fr-btn-primary" on:click={doSearch} disabled={searching}>{searching ? '...' : 'Search'}</button>
            </div>
            <p class="fr-hint">Managers appear here once they've synced to the leaderboard. Names must match exactly.</p>
            {#if searchResults.length > 0}
                <div class="fr-list">
                    {#each searchResults as r (r.uid)}
                        <div class="fr-row">
                            <span class="fr-logo">{r.teamLogo}</span>
                            <div class="fr-rowinfo">
                                <span class="fr-name">{r.teamName}</span>
                                <span class="fr-meta">{r.displayName} · 🏆 {r.trophies} · ⚡ {r.totalPower}</span>
                            </div>
                            {#if alreadyKnown(r.uid)}
                                <span class="fr-tag">Added</span>
                            {:else}
                                <button class="fr-btn" on:click={() => sendFriendRequest(r)}>+ Add</button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {:else if searchQuery && !searching}
                <p class="fr-empty">No managers found with that exact name.</p>
            {/if}
        </div>

        <!-- Incoming requests -->
        {#if incoming.length > 0}
            <div class="fr-panel">
                <div class="fr-panel-label">Friend Requests ({incoming.length})</div>
                <div class="fr-list">
                    {#each incoming as f (f.id)}
                        {@const p = profOf(f)}
                        <div class="fr-row">
                            <span class="fr-logo">{p.logo}</span>
                            <div class="fr-rowinfo">
                                <span class="fr-name">{p.team}</span>
                                <span class="fr-meta">{p.name} wants to be friends</span>
                            </div>
                            <button class="fr-btn fr-btn-primary" on:click={() => acceptRequest(f.id)}>Accept</button>
                            <button class="fr-btn fr-btn-danger" on:click={() => removeFriendship(f.id)}>Decline</button>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Friends -->
        <div class="fr-panel">
            <div class="fr-panel-label">Your Friends ({friends.length})</div>
            {#if friends.length === 0}
                <p class="fr-empty">No friends yet. Search for a manager above to send a request.</p>
            {:else}
                <div class="fr-list">
                    {#each friends as f (f.id)}
                        {@const p = profOf(f)}
                        <div class="fr-row">
                            <span class="fr-logo">{p.logo}</span>
                            <div class="fr-rowinfo">
                                <span class="fr-name">{p.team}</span>
                                <span class="fr-meta">{p.name}</span>
                            </div>
                            <button class="fr-btn" on:click={() => viewFriend(f)}>View</button>
                            <button class="fr-btn fr-btn-primary" on:click={() => challengeFriend(f)}>⚔️ Challenge</button>
                            <button class="fr-btn fr-btn-danger" on:click={() => removeFriendship(f.id)}>Remove</button>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Outgoing (sent) -->
        {#if outgoing.length > 0}
            <div class="fr-panel">
                <div class="fr-panel-label">Sent Requests ({outgoing.length})</div>
                <div class="fr-list">
                    {#each outgoing as f (f.id)}
                        {@const p = profOf(f)}
                        <div class="fr-row">
                            <span class="fr-logo">{p.logo}</span>
                            <div class="fr-rowinfo">
                                <span class="fr-name">{p.team}</span>
                                <span class="fr-meta">Pending · {p.name}</span>
                            </div>
                            <button class="fr-btn fr-btn-danger" on:click={() => removeFriendship(f.id)}>Cancel</button>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
</section>

<ProfileModal player={selectedPlayer} onClose={() => selectedPlayer = null} />

<style>
    .fr { max-width: 760px; margin: 0 auto; padding-bottom: 40px; }
    .fr-head { margin-bottom: 20px; }
    .fr-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .fr-sub { font-size: 12px; color: #64748b; margin-top: 3px; }

    .fr-panel { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 14px; padding: 16px 18px; margin-bottom: 14px; }
    .fr-panel-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 12px; }

    .fr-search { display: flex; gap: 8px; }
    .fr-input { flex: 1; padding: 10px 14px; font-size: 12px; }
    .fr-hint { font-size: 10px; color: #475569; margin-top: 8px; }

    .fr-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .fr-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; background: rgba(15,23,42,0.35); }
    .fr-logo { font-size: 24px; flex: 0 0 auto; }
    .fr-rowinfo { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; margin-right: auto; }
    .fr-name { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .fr-meta { font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .fr-btn { padding: 7px 12px; border-radius: 8px; font-size: 10px; font-weight: 900; cursor: pointer; white-space: nowrap; background: rgba(30,41,59,0.6); border: 1px solid rgba(71,85,105,0.3); color: #cbd5e1; transition: all 0.12s; }
    .fr-btn:hover { background: rgba(51,65,85,0.7); color: #f1f5f9; }
    .fr-btn:disabled { opacity: 0.5; cursor: wait; }
    .fr-btn-primary { background: linear-gradient(135deg, #4338ca, #6366f1); border-color: transparent; color: #fff; }
    .fr-btn-primary:hover { box-shadow: 0 3px 12px rgba(99,102,241,0.3); }
    .fr-btn-danger { background: rgba(127,29,29,0.2); border-color: rgba(239,68,68,0.2); color: #f87171; }
    .fr-btn-danger:hover { background: rgba(127,29,29,0.4); color: #fca5a5; }

    .fr-tag { font-size: 10px; font-weight: 800; color: #34d399; padding: 6px 10px; }
    .fr-empty { font-size: 12px; color: #475569; font-style: italic; padding: 6px 0; }

    .fr-signin { text-align: center; max-width: 460px; margin: 50px auto; padding: 40px 24px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 20px; }
    .fr-signin-ico { font-size: 44px; margin-bottom: 12px; }
    .fr-signin-t { font-size: 18px; font-weight: 900; color: #e2e8f0; margin-bottom: 8px; }
    .fr-signin-p { font-size: 12px; color: #64748b; line-height: 1.6; margin-bottom: 18px; }
</style>
