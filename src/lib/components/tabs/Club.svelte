<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { inspectingCard } from '../../stores/ui.js';
    import { getSellValue, TIER_ORDER, LEGACY_TIERS } from '../../utils/cards.js';
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

    function sellCard(card) {
        const inSquad = Object.values($squad).some(s => s && s.uniqueId === card.uniqueId);
        if (inSquad) { showToast('Card is in your squad.', 'error'); return; }
        if (card.locked) { showToast('Card is locked.', 'error'); return; }
        const price = getSellValue(card.quality, card);
        club.update(c => c.filter(x => x.uniqueId !== card.uniqueId));
        blueEssence.update(v => v + price);
        showToast(`Sold ${card.name} for ${price} BE`, 'info');
        saveGame();
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
</script>

<section class="club">
    <!-- Header -->
    <div class="club-head">
        <div>
            <h2 class="club-title">Club Vault</h2>
            <p class="club-sub">{$club.length} cards · {holoCount} holo · {sigCount} sig · {favCount} fav</p>
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
                        {#if !card.locked && !Object.values($squad).some(s => s && s.uniqueId === card.uniqueId)}
                            <button class="ca-btn ca-sell" on:click={() => sellCard(card)}>
                                Sell +{getSellValue(card.quality, card)}
                            </button>
                        {:else}
                            <span class="ca-status">
                                {Object.values($squad).some(s => s && s.uniqueId === card.uniqueId) ? 'In Squad' : 'Locked'}
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

    /* Header */
    .club-head { margin-bottom: 16px; }
    .club-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .club-sub { font-size: 11px; color: #64748b; margin-top: 3px; }

    /* Filters */
    .filter-bar {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 14px 18px; border-radius: 14px; margin-bottom: 20px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.18);
    }
    .filter-search { flex: 1; min-width: 160px; padding: 9px 14px; font-size: 12px; }
    .filter-select { font-size: 11px; padding: 9px 14px; }
    .filter-count { font-size: 10px; color: #475569; font-weight: 700; margin-left: auto; }

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
