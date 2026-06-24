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

    const tierOptions = ['ALL', 'Holographic', 'Signature', ...TIER_ORDER, ...LEGACY_TIERS];
    const roleOptions = ['ALL', 'TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
    const sortOptions = [
        { value: 'rating', label: 'Rating' },
        { value: 'name', label: 'Name' },
        { value: 'quality', label: 'Tier' },
        { value: 'team', label: 'Team' },
    ];

    $: filtered = (() => {
        let cards = [...$club];
        if (search) {
            const q = search.toLowerCase();
            cards = cards.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q));
        }
        if (tierFilter === 'Holographic') cards = cards.filter(c => c.holographic);
        else if (tierFilter === 'Signature') cards = cards.filter(c => c.signature);
        else if (tierFilter !== 'ALL') cards = cards.filter(c => c.quality === tierFilter);
        if (roleFilter !== 'ALL') cards = cards.filter(c => c.role === roleFilter);

        if (sortBy === 'rating') cards.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'name') cards.sort((a, b) => a.name.localeCompare(b.name));
        else if (sortBy === 'quality') cards.sort((a, b) => TIER_ORDER.indexOf(b.quality) - TIER_ORDER.indexOf(a.quality));
        else if (sortBy === 'team') cards.sort((a, b) => a.team.localeCompare(b.team));

        cards.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
        return cards;
    })();

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

<section class="pb-10 pt-2">
    <div class="flex items-center justify-between mb-4">
        <div>
            <h2 style="font-size:18px; font-weight:900; color:#e2e8f0; letter-spacing:0.5px;">Club Vault</h2>
            <p style="font-size:11px; color:#475569; margin-top:2px;">{$club.length} cards · {$club.filter(c => c.holographic).length} holo · {$club.filter(c => c.signature).length} sig</p>
        </div>
    </div>

    <!-- Filters -->
    <div style="background:rgba(12,16,28,0.5); border:1px solid rgba(51,65,85,0.18); border-radius:14px; padding:12px 16px; margin-bottom:16px; display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
        <input type="text" bind:value={search} placeholder="Search player or team..." class="input" style="flex:1; min-width:150px; padding:8px 12px; font-size:12px;">
        <select bind:value={tierFilter} class="input" style="font-size:11px; padding:8px 12px;">
            {#each tierOptions as t}
                <option value={t}>{t === 'ALL' ? 'All Tiers' : t}</option>
            {/each}
        </select>
        <select bind:value={roleFilter} class="input" style="font-size:11px; padding:8px 12px;">
            {#each roleOptions as r}
                <option value={r}>{r === 'ALL' ? 'All Roles' : r}</option>
            {/each}
        </select>
        <select bind:value={sortBy} class="input" style="font-size:11px; padding:8px 12px;">
            {#each sortOptions as s}
                <option value={s.value}>Sort: {s.label}</option>
            {/each}
        </select>
        <span style="font-size:10px; color:#475569; font-weight:700;">{filtered.length} shown</span>
    </div>

    <!-- Card Grid -->
    {#if filtered.length === 0}
        <div class="text-center py-20">
            <p class="text-slate-500 font-mono text-sm">{$club.length === 0 ? 'No cards yet. Open packs in the Store!' : 'No cards match your filters.'}</p>
        </div>
    {:else}
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:12px; justify-items:center;">
            {#each filtered as card (card.uniqueId)}
                <div class="flex flex-col items-center gap-1.5 group">
                    <Card {card} mini={true} />
                    <!-- Action buttons -->
                    <div class="flex gap-1 w-full opacity-70 group-hover:opacity-100 transition">
                        <button
                            class="text-[10px] px-2 py-1 rounded cursor-pointer font-bold {card.favorite ? 'bg-yellow-800/60 text-yellow-300' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}"
                            on:click={() => toggleFavorite(card)}
                        >{card.favorite ? '★' : '☆'}</button>
                        <button
                            class="text-[10px] px-2 py-1 rounded cursor-pointer font-bold {card.locked ? 'bg-amber-800/60 text-amber-300' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}"
                            on:click={() => toggleLock(card)}
                        >{card.locked ? '🔒' : '🔓'}</button>
                        {#if !card.locked && !Object.values($squad).some(s => s && s.uniqueId === card.uniqueId)}
                            <button
                                class="text-[10px] px-2 py-1 rounded cursor-pointer font-bold bg-red-900/40 text-red-400 hover:bg-red-800/60 flex-1"
                                on:click={() => sellCard(card)}
                            >Sell +{getSellValue(card.quality, card)}</button>
                        {:else}
                            <span class="text-[10px] px-2 py-1 rounded bg-slate-700/50 text-slate-600 flex-1 text-center font-bold">
                                {Object.values($squad).some(s => s && s.uniqueId === card.uniqueId) ? 'In Squad' : 'Locked'}
                            </span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>
