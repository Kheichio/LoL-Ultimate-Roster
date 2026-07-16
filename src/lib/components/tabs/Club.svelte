<script>
    import Card from '../card/Card.svelte';
    import { club, squad, academy, blueEssence, showcasePicks, saveGame, clubCapacity, skills, grantBE } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { inspectingCard, openConfirmModal } from '../../stores/ui.js';
    import { getSellValue, getEffectiveRating, TIER_ORDER, LEGACY_TIERS, TIER_COLORS } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    let search = '';
    let tierFilter = 'ALL';
    let roleFilter = 'ALL';
    let sortBy = 'rating';

    const tierOptions = ['ALL', 'Favourites', 'Holographic', 'Signature', ...TIER_ORDER, ...LEGACY_TIERS];
    const roleOptions = ['ALL', 'TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
    const sortOptions = [
        { value: 'rating', label: 'Rating' },
        { value: 'name', label: 'Name' },
        { value: 'quality', label: 'Tier' },
        { value: 'team', label: 'Team' },
        { value: 'favorites', label: 'Favourites' },
    ];

    $: filtered = (() => {
        let cards = [...$club];
        if (search) {
            const q = search.toLowerCase();
            cards = cards.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q));
        }
        if (tierFilter === 'Favourites') cards = cards.filter(c => c.favorite);
        else if (tierFilter === 'Holographic') cards = cards.filter(c => c.holographic);
        else if (tierFilter === 'Signature') cards = cards.filter(c => c.signature);
        else if (tierFilter !== 'ALL') cards = cards.filter(c => c.quality === tierFilter);
        if (roleFilter !== 'ALL') cards = cards.filter(c => c.role === roleFilter);

        if (sortBy === 'rating') cards.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'name') cards.sort((a, b) => a.name.localeCompare(b.name));
        else if (sortBy === 'quality') cards.sort((a, b) => TIER_ORDER.indexOf(b.quality) - TIER_ORDER.indexOf(a.quality));
        else if (sortBy === 'team') cards.sort((a, b) => a.team.localeCompare(b.team));
        else if (sortBy === 'favorites') cards.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

        if (sortBy !== 'favorites') cards.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
        return cards;
    })();

    $: holoCount = $club.filter(c => c.holographic).length;
    $: sigCount = $club.filter(c => c.signature).length;
    $: favCount = $club.filter(c => c.favorite).length;

    // --- Bulk sell helpers ---
    $: squadIds = new Set(Object.values($squad).filter(Boolean).map(s => s.uniqueId));
    $: academyIds = new Set(['TOP','JNG','MID','ADC','SUP'].map(r => $academy[r]?.uniqueId).filter(Boolean));
    // Cards in the squad or academy are in-use and never sellable.
    $: protectedIds = new Set([...squadIds, ...academyIds]);

    function keeperScore(c) {
        return getEffectiveRating(c) * 100 + (c.signature ? 40 : 0) + (c.holographic ? 20 : 0) + (c.favorite ? 10 : 0) + (c.locked ? 5 : 0);
    }
    // For each player owned more than once, keep the best copy; return the rest that are safe to sell.
    function collectDuplicates(clubCards, protectedIds) {
        const byId = new Map();
        for (const c of clubCards) {
            if (!byId.has(c.id)) byId.set(c.id, []);
            byId.get(c.id).push(c);
        }
        const toSell = [];
        for (const group of byId.values()) {
            if (group.length < 2) continue;
            const keeper = [...group].sort((a, b) => keeperScore(b) - keeperScore(a))[0];
            for (const c of group) {
                if (c.uniqueId === keeper.uniqueId) continue;
                if (c.locked || c.favorite || protectedIds.has(c.uniqueId)) continue;
                toSell.push(c);
            }
        }
        return toSell;
    }
    // Standard tiers the player actually owns and can bulk-sell (protected cards excluded).
    $: quickSellTiers = TIER_ORDER.map(tier => {
        const cards = $club.filter(c => c.quality === tier && !c.locked && !c.favorite && !protectedIds.has(c.uniqueId));
        return { tier, count: cards.length, total: cards.reduce((s, c) => s + getSellValue(c.quality, c, $skills.transfer), 0) };
    }).filter(t => t.count > 0);
    $: dupeSellList = collectDuplicates($club, protectedIds);
    $: dupeInfo = { count: dupeSellList.length, total: dupeSellList.reduce((s, c) => s + getSellValue(c.quality, c, $skills.transfer), 0) };

    function sellCard(card) {
        if (squadIds.has(card.uniqueId)) { showToast('Card is in your squad.', 'error'); return; }
        if (academyIds.has(card.uniqueId)) { showToast('Card is in your academy.', 'error'); return; }
        if (card.locked) { showToast('Card is locked.', 'error'); return; }
        const price = getSellValue(card.quality, card, $skills.transfer);
        club.update(c => c.filter(x => x.uniqueId !== card.uniqueId));
        const earned = grantBE(price).total;
        showToast(`Sold ${card.name} for ${earned} BE`, 'info');
        saveGame();
    }

    function quickSellTier(tier) {
        const cards = $club.filter(c => c.quality === tier && !c.locked && !c.favorite && !protectedIds.has(c.uniqueId));
        if (!cards.length) { showToast(`No sellable ${tier} cards.`, 'error'); return; }
        const total = cards.reduce((s, c) => s + getSellValue(c.quality, c, $skills.transfer), 0);
        openConfirmModal(
            `Sell all ${cards.length} ${tier} card${cards.length > 1 ? 's' : ''} for ${total} BE? Locked, favourited, and squad cards are kept.`,
            () => {
                const ids = new Set(cards.map(c => c.uniqueId));
                club.update(c => c.filter(x => !ids.has(x.uniqueId)));
                const earned = grantBE(total).total;
                showToast(`Sold ${cards.length} ${tier} card${cards.length > 1 ? 's' : ''} for ${earned} BE`, 'success');
                saveGame();
            }
        );
    }

    function sellDuplicates() {
        const cards = collectDuplicates($club, protectedIds);
        if (!cards.length) { showToast('No duplicates to sell.', 'info'); return; }
        const total = cards.reduce((s, c) => s + getSellValue(c.quality, c, $skills.transfer), 0);
        openConfirmModal(
            `Sell ${cards.length} duplicate${cards.length > 1 ? 's' : ''} for ${total} BE? This keeps the best copy of each player; locked, favourited, and squad cards are kept.`,
            () => {
                const ids = new Set(cards.map(c => c.uniqueId));
                club.update(c => c.filter(x => !ids.has(x.uniqueId)));
                const earned = grantBE(total).total;
                showToast(`Sold ${cards.length} duplicate${cards.length > 1 ? 's' : ''} for ${earned} BE`, 'success');
                saveGame();
            }
        );
    }

    function toggleLock(card) {
        card.locked = !card.locked;
        club.update(c => [...c]);
        saveGame();
    }

    function toggleFavorite(card) {
        card.favorite = !card.favorite;
        club.update(c => [...c]);
        saveGame();
    }

    $: showcaseCards = ($showcasePicks || []).map(uid => $club.find(c => c.uniqueId === uid)).filter(Boolean);
    let dragIdx = null;
    let dragOverIdx = null;

    function onShowcaseDragStart(e, idx) { dragIdx = idx; e.dataTransfer.effectAllowed = 'move'; }
    function onShowcaseDragOver(e, idx) { e.preventDefault(); dragOverIdx = idx; }
    function onShowcaseDrop(e, idx) {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) { dragIdx = null; dragOverIdx = null; return; }
        const picks = [...$showcasePicks];
        const [moved] = picks.splice(dragIdx, 1);
        picks.splice(idx, 0, moved);
        showcasePicks.set(picks);
        saveGame();
        dragIdx = null;
        dragOverIdx = null;
    }
    function onShowcaseDragEnd() { dragIdx = null; dragOverIdx = null; }

    function removeFromShowcase(uid) {
        showcasePicks.update(p => p.filter(id => id !== uid));
        saveGame();
    }
    function addToShowcase(card) {
        if ($showcasePicks.length >= 3) { showToast('Max 3 showcase cards.', 'error'); return; }
        if ($showcasePicks.includes(card.uniqueId)) { showToast('Already in showcase.', 'error'); return; }
        showcasePicks.update(p => [...p, card.uniqueId]);
        saveGame();
        showToast(`${card.name} added to showcase.`, 'success');
    }
    function isInShowcase(card) { return ($showcasePicks || []).includes(card.uniqueId); }
</script>

<section class="club">
    <!-- Header -->
    <div class="club-head">
        <div>
            <h2 class="club-title">Club Vault</h2>
            <p class="club-sub">{$club.length}/{$clubCapacity} cards · {holoCount} holo · {sigCount} sig · {favCount} fav</p>
            <div class="club-cap-bar"><div class="club-cap-fill" style="width:{Math.min(100,($club.length/$clubCapacity)*100)}%; background:{$club.length >= $clubCapacity ? '#ef4444' : $club.length / $clubCapacity > 0.9 ? '#f59e0b' : '#34d399'};"></div></div>
        </div>
    </div>

    <!-- Card Showcase -->
    <div class="showcase-panel">
        <div class="showcase-head">
            <span class="showcase-label">Card Showcase ({showcaseCards.length}/3)</span>
            <span class="showcase-hint">Drag to reorder · Shown on your leaderboard profile</span>
        </div>
        <div class="showcase-slots">
            {#each [0, 1, 2] as idx}
                {#if showcaseCards[idx]}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="showcase-slot showcase-slot-filled"
                        class:showcase-dragging={dragIdx === idx}
                        class:showcase-dragover={dragOverIdx === idx && dragIdx !== idx}
                        draggable="true"
                        on:dragstart={(e) => onShowcaseDragStart(e, idx)}
                        on:dragover={(e) => onShowcaseDragOver(e, idx)}
                        on:drop={(e) => onShowcaseDrop(e, idx)}
                        on:dragend={onShowcaseDragEnd}
                    >
                        <Card card={showcaseCards[idx]} mini={true} />
                        <button class="showcase-remove" on:click={() => removeFromShowcase(showcaseCards[idx].uniqueId)}>✕</button>
                    </div>
                {:else}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="showcase-slot showcase-slot-empty"
                        on:dragover={(e) => onShowcaseDragOver(e, idx)}
                        on:drop={(e) => onShowcaseDrop(e, idx)}
                    >
                        <span class="showcase-plus">+</span>
                        <span class="showcase-add-label">Add card</span>
                    </div>
                {/if}
            {/each}
        </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
        <input type="text" bind:value={search} placeholder="Search player or team..." class="input filter-search">
        <select bind:value={tierFilter} class="input filter-select">
            {#each tierOptions as t}
                <option value={t}>{t === 'ALL' ? 'All Tiers' : t}</option>
            {/each}
        </select>
        <select bind:value={roleFilter} class="input filter-select">
            {#each roleOptions as r}
                <option value={r}>{r === 'ALL' ? 'All Roles' : r}</option>
            {/each}
        </select>
        <select bind:value={sortBy} class="input filter-select">
            {#each sortOptions as s}
                <option value={s.value}>Sort: {s.label}</option>
            {/each}
        </select>
        <span class="filter-count">{filtered.length} shown</span>
    </div>

    <!-- Bulk sell actions -->
    {#if quickSellTiers.length > 0 || dupeInfo.count > 0}
        <div class="bulk-bar">
            <span class="bulk-label">Quick Sell</span>
            {#each quickSellTiers as t}
                <button class="bulk-btn" style="border-left:3px solid {TIER_COLORS[t.tier] || '#475569'};" on:click={() => quickSellTier(t.tier)}>
                    {t.tier} <span class="bulk-ct">{t.count}</span> <span class="bulk-be">+{t.total}</span>
                </button>
            {/each}
            <button class="bulk-btn bulk-dupes" on:click={sellDuplicates} disabled={dupeInfo.count === 0}>
                Sell Duplicates <span class="bulk-ct">{dupeInfo.count}</span> <span class="bulk-be">+{dupeInfo.total}</span>
            </button>
        </div>
    {/if}

    <!-- Card Grid -->
    {#if filtered.length === 0}
        <div class="club-empty">
            <p>{$club.length === 0 ? 'No cards yet. Open packs in the Store!' : 'No cards match your filters.'}</p>
        </div>
    {:else}
        <div class="card-grid">
            {#each filtered as card (card.uniqueId)}
                <div class="card-slot">
                    <Card {card} mini={true} />
                    <div class="card-actions">
                        <button
                            class="ca-btn" class:ca-fav-on={card.favorite}
                            on:click={() => toggleFavorite(card)}
                        >{card.favorite ? '★' : '☆'}</button>
                        <button
                            class="ca-btn" class:ca-lock-on={card.locked}
                            on:click={() => toggleLock(card)}
                        >{card.locked ? '🔒' : '🔓'}</button>
                        <button
                            class="ca-btn" class:ca-showcase-on={isInShowcase(card)}
                            on:click={() => isInShowcase(card) ? removeFromShowcase(card.uniqueId) : addToShowcase(card)}
                        >{isInShowcase(card) ? '⭐' : '☆'}</button>
                        {#if !card.locked && !protectedIds.has(card.uniqueId)}
                            <button class="ca-btn ca-sell" on:click={() => sellCard(card)}>
                                +{getSellValue(card.quality, card, $skills.transfer)}
                            </button>
                        {:else}
                            <span class="ca-status">
                                {squadIds.has(card.uniqueId) ? 'Squad' : academyIds.has(card.uniqueId) ? 'Academy' : 'Locked'}
                            </span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>

<style>
    .club { padding-bottom: 40px; }

    /* Showcase */
    .showcase-panel {
        margin-bottom: 20px; padding: 16px; border-radius: 14px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
    }
    .showcase-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .showcase-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #fbbf24; }
    .showcase-hint { font-size: 9px; color: #475569; }
    .showcase-slots { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .showcase-slot { position: relative; border-radius: 14px; transition: all 0.15s; }
    .showcase-slot-filled { cursor: grab; border: 2px solid transparent; }
    .showcase-slot-filled:hover { border-color: rgba(251,191,36,0.3); }
    .showcase-slot-filled:active { cursor: grabbing; }
    .showcase-dragging { opacity: 0.4; transform: scale(0.95); }
    .showcase-dragover { border-color: rgba(59,130,246,0.6) !important; background: rgba(59,130,246,0.05); }
    .showcase-slot-empty {
        width: 180px; height: 260px; border-radius: 14px;
        border: 2px dashed rgba(51,65,85,0.25);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
        color: #1e293b; transition: border-color 0.12s;
    }
    .showcase-slot-empty:hover { border-color: rgba(251,191,36,0.3); }
    .showcase-plus { font-size: 24px; font-weight: 900; }
    .showcase-add-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .showcase-remove {
        position: absolute; top: 4px; right: 4px; z-index: 5;
        width: 22px; height: 22px; border-radius: 50%;
        background: rgba(0,0,0,0.7); border: 1px solid rgba(239,68,68,0.3);
        color: #f87171; font-size: 10px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.12s;
    }
    .showcase-slot-filled:hover .showcase-remove { opacity: 1; }
    .showcase-remove:hover { background: rgba(127,29,29,0.8); color: white; }

    .ca-showcase-on {
        background: rgba(234,179,8,0.12) !important;
        border-color: rgba(234,179,8,0.25) !important;
        color: #fbbf24 !important;
    }

    /* Header */
    .club-head { margin-bottom: 16px; }
    .club-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .club-sub { font-size: 11px; color: #64748b; margin-top: 3px; }
    .club-cap-bar { height: 3px; background: rgba(30,41,59,0.8); border-radius: 99px; overflow: hidden; margin-top: 5px; max-width: 200px; }
    .club-cap-fill { height: 100%; border-radius: 99px; transition: width 0.3s; }

    /* Filters */
    .filter-bar {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 14px 18px; border-radius: 14px; margin-bottom: 20px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.18);
    }
    .filter-search { flex: 1; min-width: 160px; padding: 9px 14px; font-size: 12px; }
    .filter-select { font-size: 11px; padding: 9px 14px; }
    .filter-count { font-size: 10px; color: #475569; font-weight: 700; margin-left: auto; }

    /* Bulk sell actions */
    .bulk-bar {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 12px 18px; border-radius: 14px; margin-top: -8px; margin-bottom: 20px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.18);
    }
    .bulk-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-right: 2px; }
    .bulk-btn {
        padding: 6px 10px; border-radius: 8px; font-size: 10px; font-weight: 800; cursor: pointer;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        color: #cbd5e1; transition: all 0.12s; display: inline-flex; align-items: center; gap: 5px;
    }
    .bulk-btn:hover { background: rgba(51,65,85,0.6); color: #f1f5f9; }
    .bulk-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .bulk-ct { font-size: 9px; color: #94a3b8; font-weight: 700; }
    .bulk-be { font-size: 9px; color: #34d399; font-weight: 800; }
    .bulk-dupes { margin-left: auto; background: rgba(127,29,29,0.15); border-color: rgba(239,68,68,0.2); color: #f87171; }
    .bulk-dupes:hover:not(:disabled) { background: rgba(127,29,29,0.3); color: #fca5a5; }

    /* Empty state */
    .club-empty {
        text-align: center; padding: 60px 20px;
        color: #475569; font-size: 13px; font-style: italic;
    }

    /* Card grid */
    .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 14px;
        justify-items: center;
    }

    /* Card slot */
    .card-slot {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
    }

    /* Action buttons */
    .card-actions {
        display: flex; gap: 4px; width: 100%; max-width: 180px;
    }
    .ca-btn {
        padding: 6px 8px; border-radius: 8px;
        font-size: 10px; font-weight: 800; cursor: pointer;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        color: #64748b; transition: all 0.12s; text-align: center;
    }
    .ca-btn:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }

    .ca-fav-on {
        background: rgba(234,179,8,0.12) !important;
        border-color: rgba(234,179,8,0.25) !important;
        color: #fbbf24 !important;
    }
    .ca-lock-on {
        background: rgba(251,146,60,0.1) !important;
        border-color: rgba(251,146,60,0.2) !important;
        color: #fb923c !important;
    }
    .ca-sell {
        flex: 1;
        background: rgba(127,29,29,0.15);
        border-color: rgba(239,68,68,0.15);
        color: #f87171;
    }
    .ca-sell:hover {
        background: rgba(127,29,29,0.3) !important;
        border-color: rgba(239,68,68,0.3) !important;
    }
    .ca-status {
        flex: 1; text-align: center;
        font-size: 10px; font-weight: 700; color: #334155;
        padding: 6px 8px; border-radius: 8px;
        background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15);
    }

    @media (max-width: 600px) {
        .card-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    }
</style>
