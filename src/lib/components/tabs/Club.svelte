<script>
    import { tick } from 'svelte';
    import Card from '../card/Card.svelte';
    import LazyCardGrid from '../card/LazyCardGrid.svelte';
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { club, squad, academy, showcasePicks, saveGame, clubCapacity, skills, grantBE } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal, switchTab } from '../../stores/ui.js';
    import { getSellValue, getEffectiveRating, getEra, TIER_ORDER, ALL_SPECIAL, TIER_COLORS } from '../../utils/cards.js';

    let search = '';
    let collFilter = 'all';
    let tierFilter = 'ALL';
    let roleFilter = 'ALL';
    let eraFilter = 'ALL';
    let sortBy = 'rating';
    let cleanOpen = false;
    let picking = false;          // choosing a card for an empty showcase slot
    let gridEl;
    let innerWidth = 1200;

    // Specials rank above every base tier, so the Tier sort must not score them as -1.
    // ALL_SPECIAL, not just legacy — award and Hall of Legends cards must be filterable too.
    const TIER_RANK = [...TIER_ORDER, ...ALL_SPECIAL];
    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };
    const ERA_OPTIONS = [
        { value: 1, label: 'Era 1 (2013 & earlier)' },
        { value: 2, label: 'Era 2 (2014-2016)' },
        { value: 3, label: 'Era 3 (2017-2019)' },
        { value: 4, label: 'Era 4 (2020-2022)' },
        { value: 5, label: 'Era 5 (2023-2025)' },
        { value: 6, label: 'Era 6 (2026+)' },
    ];
    const sortOptions = [
        { value: 'rating', label: 'Rating' },
        { value: 'recent', label: 'Newest' },
        { value: 'name', label: 'Name' },
        { value: 'quality', label: 'Tier' },
        { value: 'team', label: 'Team' },
    ];

    // Only offer tiers and eras the vault can actually produce, so no dropdown shows dead options.
    $: ownedTiers = TIER_RANK.filter(t => $club.some(c => c.quality === t));
    $: eraOptions = ERA_OPTIONS.filter(e => $club.some(c => getEra(c.year) === e.value));

    // --- In-use / protection ---
    $: squadIds = new Set(Object.values($squad).filter(Boolean).map(s => s.uniqueId));
    $: academyIds = new Set(['TOP','JNG','MID','ADC','SUP'].map(r => $academy[r]?.uniqueId).filter(Boolean));
    // Cards in the squad or academy are in-use and never sellable.
    $: protectedIds = new Set([...squadIds, ...academyIds]);
    $: showcaseSet = new Set($showcasePicks || []);
    // Bulk sells also keep showcased cards — those were picked by hand, one at a time.
    $: bulkProtected = new Set([...protectedIds, ...showcaseSet]);
    const sellValue = (c) => getSellValue(c.quality, c, $skills.transfer);
    $: isSellable = (c) => !c.locked && !protectedIds.has(c.uniqueId);

    $: COLL = [
        { id: 'all', label: 'All', icon: 'cards', n: $club.length },
        { id: 'fav', label: 'Favourites', icon: 'star', n: $club.filter(c => c.favorite).length },
        { id: 'holo', label: 'Holo', icon: 'sparkle', n: $club.filter(c => c.holographic).length },
        { id: 'sig', label: 'Signature', icon: 'crown', n: $club.filter(c => c.signature).length },
        { id: 'locked', label: 'Locked', icon: 'lock', n: $club.filter(c => c.locked).length },
        { id: 'sellable', label: 'Sellable', icon: 'coins', n: $club.filter(c => isSellable(c)).length },
    ];

    $: filtered = (() => {
        const order = new Map($club.map((c, i) => [c.uniqueId, i]));
        let cards = [...$club];
        if (search) {
            const q = search.toLowerCase();
            cards = cards.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q) || String(c.year || '').includes(q));
        }
        if (collFilter === 'fav') cards = cards.filter(c => c.favorite);
        else if (collFilter === 'holo') cards = cards.filter(c => c.holographic);
        else if (collFilter === 'sig') cards = cards.filter(c => c.signature);
        else if (collFilter === 'locked') cards = cards.filter(c => c.locked);
        else if (collFilter === 'sellable') cards = cards.filter(c => isSellable(c));
        if (tierFilter !== 'ALL') cards = cards.filter(c => c.quality === tierFilter);
        if (roleFilter !== 'ALL') cards = cards.filter(c => c.role === roleFilter);
        if (eraFilter !== 'ALL') cards = cards.filter(c => getEra(c.year) === eraFilter);

        if (sortBy === 'rating') cards.sort((a, b) => b.rating - a.rating);
        else if (sortBy === 'recent') cards.sort((a, b) => order.get(b.uniqueId) - order.get(a.uniqueId));
        else if (sortBy === 'name') cards.sort((a, b) => a.name.localeCompare(b.name));
        else if (sortBy === 'quality') cards.sort((a, b) => TIER_RANK.indexOf(b.quality) - TIER_RANK.indexOf(a.quality));
        else if (sortBy === 'team') cards.sort((a, b) => a.team.localeCompare(b.team));

        // Favourites always lead (stable sort, so the chosen order holds within each group).
        cards.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
        return cards;
    })();
    $: anyFilter = !!search || collFilter !== 'all' || tierFilter !== 'ALL' || roleFilter !== 'ALL' || eraFilter !== 'ALL';
    function resetFilters() { search = ''; collFilter = 'all'; tierFilter = 'ALL'; roleFilter = 'ALL'; eraFilter = 'ALL'; }

    // --- Header figures ---
    $: capPct = $clubCapacity > 0 ? Math.min(1, $club.length / $clubCapacity) : 0;
    $: full = $club.length >= $clubCapacity;
    $: vaultValue = $club.reduce((s, c) => s + sellValue(c), 0);

    // --- Bulk sell helpers ---
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
    const tierSellable = (tier) => $club.filter(c => c.quality === tier && !c.locked && !c.favorite && !bulkProtected.has(c.uniqueId));
    // Standard tiers the player actually owns and can bulk-sell (protected cards excluded).
    $: quickSellTiers = ($club, bulkProtected, TIER_ORDER.map(tier => {
        const cards = tierSellable(tier);
        return { tier, count: cards.length, total: cards.reduce((s, c) => s + sellValue(c), 0) };
    }).filter(t => t.count > 0));
    $: dupeSellList = collectDuplicates($club, bulkProtected);
    $: dupeInfo = { count: dupeSellList.length, total: dupeSellList.reduce((s, c) => s + sellValue(c), 0) };
    $: bulkCount = quickSellTiers.reduce((s, t) => s + t.count, 0);
    $: bulkTotal = quickSellTiers.reduce((s, t) => s + t.total, 0);

    // A sold card must leave the showcase too, or its dead id keeps holding a slot.
    function pruneShowcase(soldIds) {
        if (!$showcasePicks.some(id => soldIds.has(id))) return;
        showcasePicks.update(p => p.filter(id => !soldIds.has(id)));
    }

    function sellCard(card) {
        if (squadIds.has(card.uniqueId)) { showToast('Card is in your squad.', 'error'); return; }
        if (academyIds.has(card.uniqueId)) { showToast('Card is in your academy.', 'error'); return; }
        if (card.locked) { showToast('Card is locked.', 'error'); return; }
        const price = sellValue(card);
        club.update(c => c.filter(x => x.uniqueId !== card.uniqueId));
        pruneShowcase(new Set([card.uniqueId]));
        const earned = grantBE(price).total;
        showToast(`Sold ${card.name} for ${earned} BE`, 'info');
        saveGame();
    }

    function quickSellTier(tier) {
        const cards = tierSellable(tier);
        if (!cards.length) { showToast(`No sellable ${tier} cards.`, 'error'); return; }
        const total = cards.reduce((s, c) => s + sellValue(c), 0);
        openConfirmModal(
            `Sell all ${cards.length} ${tier} card${cards.length > 1 ? 's' : ''} for ${total} BE? Locked, favourited, showcased and squad cards are kept.`,
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
        const cards = collectDuplicates($club, bulkProtected);
        if (!cards.length) { showToast('No duplicates to sell.', 'info'); return; }
        const total = cards.reduce((s, c) => s + sellValue(c), 0);
        openConfirmModal(
            `Sell ${cards.length} duplicate${cards.length > 1 ? 's' : ''} for ${total} BE? This keeps the best copy of each player; locked, favourited, showcased and squad cards are kept.`,
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

    // --- Showcase ---
    $: showcaseCards = ($showcasePicks || []).map(uid => $club.find(c => c.uniqueId === uid)).filter(Boolean);
    let dragIdx = null;
    let dragOverIdx = null;

    function onShowcaseDragStart(e, idx) { dragIdx = idx; e.dataTransfer.effectAllowed = 'move'; }
    function onShowcaseDragOver(e, idx) { e.preventDefault(); dragOverIdx = idx; }
    function onShowcaseDrop(e, idx) {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) { dragIdx = null; dragOverIdx = null; return; }
        // Reorder the cards that resolve, so a stale id can never be dragged into place.
        const picks = showcaseCards.map(c => c.uniqueId);
        const [moved] = picks.splice(dragIdx, 1);
        picks.splice(Math.min(idx, picks.length), 0, moved);
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
        if (showcaseCards.length >= 3) { showToast('Max 3 showcase cards.', 'error'); return false; }
        if (showcaseSet.has(card.uniqueId)) { showToast('Already in showcase.', 'error'); return false; }
        // Drop ids whose card is gone before adding, so they never count against the three.
        showcasePicks.set([...showcaseCards.map(c => c.uniqueId), card.uniqueId]);
        saveGame();
        showToast(`${card.name} added to showcase.`, 'success');
        return true;
    }
    function toggleShowcase(card) {
        if (showcaseSet.has(card.uniqueId)) removeFromShowcase(card.uniqueId);
        else addToShowcase(card);
    }

    async function startPicking() {
        if (showcaseCards.length >= 3) return;
        picking = true;
        await tick();
        gridEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function pickForShowcase(card) {
        if (showcaseSet.has(card.uniqueId)) { showToast('Already in showcase.', 'error'); return; }
        if (addToShowcase(card)) {
            picking = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    function onKey(e) { if (picking && e.key === 'Escape') picking = false; }

    $: narrow = innerWidth <= 600;
</script>

<svelte:window bind:innerWidth on:keydown={onKey} />

<section class="vault">
    <!-- ═══ Hero ═══ -->
    <header class="vh">
        <div class="vh-glow" aria-hidden="true"></div>
        <div class="vh-ring" class:vh-warn={capPct >= 0.9 && !full} class:vh-full={full}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="ring-bg" cx="60" cy="60" r="52" />
                <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {capPct * 326.7} 999;" />
            </svg>
            <span class="vr-n">{$club.length}</span>
            <span class="vr-cap">of {$clubCapacity}</span>
        </div>
        <div class="vh-text">
            <span class="vh-eyebrow"><Icon name="club" size={12} stroke={2.2} /> Club</span>
            <h2 class="vh-title">Club Vault</h2>
            <p class="vh-sub">
                {#if full}<span class="vh-alert">Your vault is full</span> — sell cards to make room for new pulls.
                {:else}{$clubCapacity - $club.length} free slot{$clubCapacity - $club.length === 1 ? '' : 's'} · every card you own lives here.{/if}
            </p>
        </div>
        <div class="vh-stats">
            <div class="vs vs-be"><span class="vs-ico"><Icon name="gem" size={16} stroke={2.1} /></span><span class="vs-n">{vaultValue.toLocaleString()}</span><span class="vs-l">BE sell value</span></div>
            <div class="vs vs-holo"><span class="vs-ico"><Icon name="sparkle" size={16} stroke={2.1} /></span><span class="vs-n">{COLL[2].n}</span><span class="vs-l">Holo</span></div>
            <div class="vs vs-sig"><span class="vs-ico"><Icon name="crown" size={16} stroke={2.1} /></span><span class="vs-n">{COLL[3].n}</span><span class="vs-l">Signature</span></div>
            <div class="vs vs-fav"><span class="vs-ico"><Icon name="star" size={16} stroke={2.1} /></span><span class="vs-n">{COLL[1].n}</span><span class="vs-l">Favourites</span></div>
        </div>
    </header>

    <!-- ═══ Showcase ═══ -->
    <section class="sc" class:sc-picking={picking}>
        <div class="sc-info">
            <span class="sc-eyebrow"><Icon name="pin" size={12} stroke={2.3} /> Showcase · {showcaseCards.length}/3</span>
            <h3 class="sc-title">Your top three</h3>
            <p class="sc-sub">Pinned to your leaderboard profile for everyone to see. Drag to reorder, or pin any card with <span class="sc-kbd"><Icon name="pin" size={11} stroke={2.4} /></span> below.</p>
            {#if picking}
                <button class="sc-cancel" on:click={() => picking = false}>Cancel picking</button>
            {/if}
        </div>
        <div class="sc-slots">
            {#each [0, 1, 2] as idx}
                {#if showcaseCards[idx]}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="sc-slot sc-filled"
                        class:sc-dragging={dragIdx === idx}
                        class:sc-dragover={dragOverIdx === idx && dragIdx !== idx}
                        draggable="true"
                        on:dragstart={(e) => onShowcaseDragStart(e, idx)}
                        on:dragover={(e) => onShowcaseDragOver(e, idx)}
                        on:drop={(e) => onShowcaseDrop(e, idx)}
                        on:dragend={onShowcaseDragEnd}
                    >
                        <span class="sc-rank">#{idx + 1}</span>
                        <div class="sc-card"><Card card={showcaseCards[idx]} mini={true} /></div>
                        <button class="sc-remove" title="Remove from showcase" aria-label="Remove {showcaseCards[idx].name} from showcase" on:click={() => removeFromShowcase(showcaseCards[idx].uniqueId)}>
                            <Icon name="close" size={12} stroke={2.8} />
                        </button>
                    </div>
                {:else}
                    <button
                        class="sc-slot sc-empty"
                        class:sc-empty-on={picking}
                        on:click={startPicking}
                        on:dragover={(e) => onShowcaseDragOver(e, idx)}
                        on:drop={(e) => onShowcaseDrop(e, idx)}
                    >
                        <span class="sc-rank">#{idx + 1}</span>
                        <span class="sc-plus"><Icon name="pin" size={22} stroke={2} /></span>
                        <span class="sc-add">{picking ? 'Pick a card below' : 'Add a card'}</span>
                    </button>
                {/if}
            {/each}
        </div>
    </section>

    <!-- ═══ Toolbar ═══ -->
    <div class="tb">
        <div class="tb-row">
            <label class="tb-search">
                <Icon name="search" size={16} stroke={2.2} />
                <input type="text" bind:value={search} placeholder="Search player, team or year" aria-label="Search the vault">
                {#if search}<button class="tb-clear" aria-label="Clear search" on:click={() => search = ''}><Icon name="close" size={12} stroke={2.6} /></button>{/if}
            </label>
            <div class="tb-roles" role="group" aria-label="Filter by role">
                <button class="rc" class:rc-on={roleFilter === 'ALL'} on:click={() => roleFilter = 'ALL'}>All</button>
                {#each ROLES as r}
                    <button class="rc" class:rc-on={roleFilter === r} title={r} aria-label={r} aria-pressed={roleFilter === r} on:click={() => roleFilter = roleFilter === r ? 'ALL' : r}>
                        <img src={ROLE_ICONS[r]} alt=""><span class="rc-l">{r}</span>
                    </button>
                {/each}
            </div>
        </div>
        <div class="tb-row tb-row2">
            <div class="tb-chips" role="group" aria-label="Collection filter">
                {#each COLL as f (f.id)}
                    <button class="chip chip-{f.id}" class:chip-on={collFilter === f.id} aria-pressed={collFilter === f.id} on:click={() => collFilter = f.id}>
                        <Icon name={f.icon} size={13} stroke={2.2} /> {f.label} <span class="chip-n">{f.n}</span>
                    </button>
                {/each}
            </div>
            <div class="tb-selects">
                <select class="sel" bind:value={tierFilter} aria-label="Tier">
                    <option value="ALL">All tiers</option>
                    {#each ownedTiers as t}<option value={t}>{t}</option>{/each}
                </select>
                <select class="sel" bind:value={eraFilter} aria-label="Era">
                    <option value="ALL">All eras</option>
                    {#each eraOptions as e}<option value={e.value}>{e.label}</option>{/each}
                </select>
                <select class="sel" bind:value={sortBy} aria-label="Sort">
                    {#each sortOptions as s}<option value={s.value}>Sort: {s.label}</option>{/each}
                </select>
            </div>
        </div>
    </div>

    <!-- ═══ Clean up (bulk sell) ═══ -->
    {#if quickSellTiers.length > 0 || dupeInfo.count > 0}
        <section class="cu" class:cu-open={cleanOpen}>
            <button class="cu-head" aria-expanded={cleanOpen} on:click={() => cleanOpen = !cleanOpen}>
                <span class="cu-ico"><Icon name="coins" size={19} /></span>
                <span class="cu-text">
                    <span class="cu-title">Clean up</span>
                    <span class="cu-note">Bulk-sell a whole tier or every duplicate · {bulkCount + dupeInfo.count} card{bulkCount + dupeInfo.count === 1 ? '' : 's'} eligible</span>
                </span>
                <span class="cu-chev"><Icon name="chevron" size={16} stroke={2.4} /></span>
            </button>
            {#if cleanOpen}
                <div class="cu-body">
                    {#each quickSellTiers as t (t.tier)}
                        <button class="cu-tile" style="--c: {TIER_COLORS[t.tier] || '#64748b'};" on:click={() => quickSellTier(t.tier)}>
                            <span class="cu-tier">{t.tier}</span>
                            <span class="cu-count">{t.count} card{t.count === 1 ? '' : 's'}</span>
                            <span class="cu-be"><Icon name="gem" size={12} stroke={2.3} /> +{t.total.toLocaleString()}</span>
                        </button>
                    {/each}
                    <button class="cu-tile cu-dupes" disabled={dupeInfo.count === 0} on:click={sellDuplicates}>
                        <span class="cu-tier"><Icon name="copy" size={13} stroke={2.2} /> Duplicates</span>
                        <span class="cu-count">{dupeInfo.count} extra cop{dupeInfo.count === 1 ? 'y' : 'ies'}</span>
                        <span class="cu-be"><Icon name="gem" size={12} stroke={2.3} /> +{dupeInfo.total.toLocaleString()}</span>
                    </button>
                    <p class="cu-foot"><Icon name="shield" size={12} stroke={2.2} /> Locked, favourited, showcased, squad and academy cards are always kept{#if bulkTotal > 0} · tiers total {bulkTotal.toLocaleString()} BE{/if}.</p>
                </div>
            {/if}
        </section>
    {/if}

    <!-- ═══ Grid ═══ -->
    <div class="grid-anchor" bind:this={gridEl}></div>
    {#if picking}
        <div class="pick-banner">
            <span class="pb-ico"><Icon name="pin" size={16} stroke={2.3} /></span>
            <span class="pb-text"><b>Pick a card for showcase slot #{showcaseCards.length + 1}.</b> Click any card below.</span>
            <button class="pb-cancel" on:click={() => picking = false}>Cancel</button>
        </div>
    {/if}

    <div class="grid-head">
        <span class="gh-count"><b>{filtered.length}</b> {filtered.length === 1 ? 'card' : 'cards'}{#if anyFilter} of {$club.length}{/if}</span>
        {#if anyFilter}<button class="gh-reset" on:click={resetFilters}><Icon name="close" size={11} stroke={2.6} /> Clear filters</button>{/if}
    </div>

    {#if filtered.length === 0}
        <div class="empty">
            <span class="empty-ico"><Icon name={$club.length === 0 ? 'store' : 'search'} size={28} /></span>
            {#if $club.length === 0}
                <p class="empty-t">Your vault is empty</p>
                <p class="empty-s">Every card you pull from a pack lands here.</p>
                <button class="empty-btn" on:click={() => switchTab('store')} use:pressFx>Open packs <Icon name="arrow" size={14} /></button>
            {:else}
                <p class="empty-t">No cards match</p>
                <p class="empty-s">Try a different search or clear your filters.</p>
                <button class="empty-btn empty-btn-ghost" on:click={resetFilters}>Clear filters</button>
            {/if}
        </div>
    {:else}
        <div class="grid" class:grid-picking={picking}>
            <LazyCardGrid items={filtered} key={(c) => c.uniqueId} minCol={narrow ? 158 : 196} gap={narrow ? 10 : 16} rowHeight={narrow ? 262 : 312} eager={2} let:item={card}>
                {@const inUse = protectedIds.has(card.uniqueId)}
                {@const pinned = showcaseSet.has(card.uniqueId)}
                <div class="vt" class:vt-fav={card.favorite} class:vt-pickable={picking && !pinned}>
                    {#if pinned}<span class="vt-pin" title="In your showcase"><Icon name="pin" size={12} stroke={2.6} /></span>{/if}
                    <Card {card} mini={true} onclick={picking ? () => pickForShowcase(card) : null} />
                    <div class="vt-bar">
                        <button class="vb vb-fav" class:vb-on={card.favorite} title={card.favorite ? 'Unfavourite' : 'Favourite'} aria-label="{card.favorite ? 'Unfavourite' : 'Favourite'} {card.name}" aria-pressed={!!card.favorite} on:click={() => toggleFavorite(card)}>
                            <Icon name="star" size={15} stroke={2.1} />
                        </button>
                        <button class="vb vb-lock" class:vb-on={card.locked} title={card.locked ? 'Unlock' : 'Lock — protects it from selling'} aria-label="{card.locked ? 'Unlock' : 'Lock'} {card.name}" aria-pressed={!!card.locked} on:click={() => toggleLock(card)}>
                            <Icon name={card.locked ? 'lock' : 'unlock'} size={15} stroke={2.1} />
                        </button>
                        <button class="vb vb-pin" class:vb-on={pinned} title={pinned ? 'Remove from showcase' : 'Pin to showcase'} aria-label="{pinned ? 'Remove from showcase' : 'Pin to showcase'}: {card.name}" aria-pressed={pinned} on:click={() => toggleShowcase(card)}>
                            <Icon name="pin" size={15} stroke={2.1} />
                        </button>
                        {#if !card.locked && !inUse}
                            <button class="vb-sell" title="Sell for {sellValue(card)} BE" on:click={() => sellCard(card)}>
                                <Icon name="gem" size={12} stroke={2.3} /> {sellValue(card).toLocaleString()}
                            </button>
                        {:else}
                            <span class="vb-status" class:vb-status-use={inUse}>
                                <Icon name={squadIds.has(card.uniqueId) ? 'squad' : academyIds.has(card.uniqueId) ? 'academy' : 'lock'} size={12} stroke={2.2} />
                                {squadIds.has(card.uniqueId) ? 'Squad' : academyIds.has(card.uniqueId) ? 'Academy' : 'Locked'}
                            </span>
                        {/if}
                    </div>
                </div>
            </LazyCardGrid>
        </div>
    {/if}
</section>

<style>
    .vault { display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; }

    /* ── Hero ── */
    .vh {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(56,189,248,0.16), transparent 65%), linear-gradient(120deg, #0a1422, #0b0e1a 60%);
        border: 1px solid rgba(56,189,248,0.25);
    }
    .vh-glow { position: absolute; right: -80px; top: -120px; width: 360px; height: 360px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(167,139,250,0.14), transparent 65%); }
    .vh-ring { position: relative; width: 108px; height: 108px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; --ring: #38bdf8; }
    .vh-warn { --ring: #f59e0b; }
    .vh-full { --ring: #ef4444; }
    .vh-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 10; }
    .ring-fg { fill: none; stroke: var(--ring); stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--ring) 60%, transparent)); transition: stroke-dasharray 0.6s ease; }
    .vr-n { position: relative; font-size: 26px; font-weight: 900; color: #f0f9ff; line-height: 1; font-variant-numeric: tabular-nums; }
    .vr-cap { position: relative; font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; margin-top: 3px; }
    .vh-text { position: relative; flex: 1; min-width: 220px; }
    .vh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #38bdf8; }
    .vh-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .vh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .vh-alert { color: #fca5a5; font-weight: 800; }
    .vh-stats { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .vs { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 96px; padding: 11px 14px; border-radius: 16px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.14); --c: #94a3b8; }
    .vs-ico { width: 28px; height: 28px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); margin-bottom: 4px; }
    .vs-n { font-size: 19px; font-weight: 900; color: #f1f5f9; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .vs-l { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .vs-be { --c: #38bdf8; }
    .vs-holo { --c: #f0abfc; }
    .vs-sig { --c: #fbbf24; }
    .vs-fav { --c: #facc15; }

    /* ── Showcase ── */
    .sc {
        position: relative; display: flex; align-items: center; gap: 26px; flex-wrap: wrap;
        padding: 20px 24px; border-radius: 22px;
        background: radial-gradient(70% 120% at 100% 100%, rgba(251,191,36,0.1), transparent 60%), linear-gradient(170deg, rgba(20,17,10,0.85), rgba(10,13,24,0.85) 60%);
        border: 1px solid rgba(251,191,36,0.2);
        transition: border-color 0.2s, box-shadow 0.2s;
    }
    .sc-picking { border-color: rgba(251,191,36,0.55); box-shadow: 0 0 0 4px rgba(251,191,36,0.08); }
    .sc-info { flex: 1; min-width: 220px; max-width: 360px; }
    .sc-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #fbbf24; }
    .sc-title { font-size: 20px; font-weight: 900; color: #fff; margin-top: 5px; }
    .sc-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; line-height: 1.5; }
    .sc-kbd { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 18px; border-radius: 6px; vertical-align: -3px; color: #fbbf24; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); }
    .sc-cancel { margin-top: 10px; padding: 7px 14px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 800; color: #e2e8f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
    .sc-cancel:hover { background: rgba(255,255,255,0.12); }
    .sc-slots { position: relative; display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin: 0 auto; padding-bottom: 14px; }
    /* the shelf the three stand on */
    .sc-slots::after { content: ''; position: absolute; left: -10px; right: -10px; bottom: 0; height: 10px; border-radius: 50%; background: radial-gradient(closest-side, rgba(251,191,36,0.35), transparent); filter: blur(3px); pointer-events: none; }
    .sc-slot { position: relative; width: 153px; height: 226px; border-radius: 14px; transition: transform 0.15s, opacity 0.15s; }
    .sc-card { zoom: 0.85; }
    .sc-filled { cursor: grab; }
    .sc-filled:hover { transform: translateY(-3px); }
    .sc-filled:active { cursor: grabbing; }
    .sc-dragging { opacity: 0.4; transform: scale(0.95); }
    .sc-dragover { outline: 2px solid rgba(56,189,248,0.7); outline-offset: 4px; }
    .sc-rank { position: absolute; left: 50%; top: -9px; transform: translateX(-50%); z-index: 8; padding: 2px 9px; border-radius: 100px; font-size: 10px; font-weight: 900; color: #1c1404; background: linear-gradient(180deg, #fde68a, #f59e0b); box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .sc-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
        border: 2px dashed rgba(251,191,36,0.25); background: rgba(251,191,36,0.03); color: #a16207;
    }
    .sc-empty .sc-rank { background: rgba(30,41,59,0.95); color: #94a3b8; box-shadow: none; border: 1px solid rgba(71,85,105,0.5); }
    .sc-empty:hover, .sc-empty-on { border-color: rgba(251,191,36,0.6); background: rgba(251,191,36,0.07); color: #fbbf24; }
    .sc-empty-on { animation: scPulse 1.6s ease-in-out infinite; }
    @keyframes scPulse { 50% { box-shadow: 0 0 24px rgba(251,191,36,0.25); } }
    .sc-plus { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.25); }
    .sc-add { font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .sc-remove {
        position: absolute; top: 6px; right: 6px; z-index: 8;
        width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: #fecaca; background: rgba(2,6,23,0.85); border: 1px solid rgba(248,113,113,0.45);
        opacity: 0; transition: opacity 0.12s, background 0.12s;
    }
    .sc-filled:hover .sc-remove, .sc-remove:focus-visible { opacity: 1; }
    .sc-remove:hover { background: #b91c1c; color: #fff; }

    /* ── Toolbar ── */
    .tb { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 20px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .tb-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .tb-search { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 9px; padding: 0 12px; height: 42px; border-radius: 13px; color: #64748b; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.35); transition: border-color 0.15s; }
    .tb-search:focus-within { border-color: rgba(56,189,248,0.6); color: #38bdf8; }
    .tb-search input { flex: 1; min-width: 0; height: 100%; background: none; border: none; outline: none; color: #e2e8f0; font-size: 13px; font-weight: 600; }
    .tb-search input::placeholder { color: #475569; }
    .tb-clear { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #94a3b8; background: rgba(71,85,105,0.35); border: none; }
    .tb-clear:hover { color: #fff; background: rgba(100,116,139,0.6); }
    .tb-roles { display: flex; gap: 4px; padding: 4px; border-radius: 13px; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.3); overflow-x: auto; scrollbar-width: none; }
    .tb-roles::-webkit-scrollbar { display: none; }
    .rc { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px; border-radius: 9px; cursor: pointer; font-size: 11px; font-weight: 900; letter-spacing: 0.6px; color: #94a3b8; background: none; border: 1px solid transparent; transition: background 0.12s, color 0.12s; }
    .rc img { width: 16px; height: 16px; opacity: 0.65; }
    .rc:hover { color: #e2e8f0; background: rgba(51,65,85,0.4); }
    .rc:hover img { opacity: 1; }
    .rc-on { color: #0b1020; background: #e2e8f0; }
    .rc-on img { opacity: 1; filter: brightness(0.2); }
    .rc-on:hover { color: #0b1020; background: #fff; }
    .tb-row2 { justify-content: space-between; }
    .tb-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 100px; cursor: pointer; font-size: 12px; font-weight: 800; color: #94a3b8; background: rgba(15,23,42,0.6); border: 1px solid rgba(71,85,105,0.3); --c: #e2e8f0; }
    .chip:hover { color: #e2e8f0; border-color: rgba(100,116,139,0.55); }
    .chip-n { font-size: 10px; font-weight: 900; color: #64748b; font-variant-numeric: tabular-nums; }
    .chip-on { color: #0b1020; background: var(--c); border-color: var(--c); }
    .chip-on .chip-n { color: rgba(11,16,32,0.6); }
    .chip-fav { --c: #facc15; }
    .chip-holo { --c: #f0abfc; }
    .chip-sig { --c: #fbbf24; }
    .chip-locked { --c: #fb923c; }
    .chip-sellable { --c: #34d399; }
    .tb-selects { display: flex; gap: 6px; flex-wrap: wrap; }
    .sel {
        height: 34px; padding: 0 30px 0 12px; border-radius: 11px; cursor: pointer; appearance: none; -webkit-appearance: none;
        font-size: 12px; font-weight: 800; color: #cbd5e1; background-color: rgba(15,23,42,0.75); border: 1px solid rgba(71,85,105,0.35);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 11px center;
    }
    .sel:hover { border-color: rgba(100,116,139,0.6); color: #f1f5f9; }
    .sel:focus { outline: none; border-color: rgba(56,189,248,0.6); }
    .sel option { background: #0f172a; color: #e2e8f0; }

    /* ── Clean up ── */
    .cu { border-radius: 18px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); overflow: hidden; }
    .cu-open { border-color: rgba(52,211,153,0.3); }
    .cu-head { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; text-align: left; background: none; border: none; }
    .cu-head:hover { background: rgba(255,255,255,0.025); }
    .cu-ico { width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #34d399; background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.25); }
    .cu-text { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .cu-title { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .cu-note { font-size: 11px; color: #64748b; }
    .cu-chev { color: #64748b; transition: transform 0.2s; }
    .cu-open .cu-chev { transform: rotate(90deg); color: #34d399; }
    .cu-body { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; padding: 2px 16px 16px; }
    .cu-tile {
        display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 11px 13px; border-radius: 13px; cursor: pointer; text-align: left;
        background: linear-gradient(150deg, color-mix(in srgb, var(--c) 16%, transparent), rgba(15,23,42,0.7) 70%);
        border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); --c: #64748b;
        transition: transform 0.12s, border-color 0.12s;
    }
    .cu-tile:hover:not(:disabled) { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 70%, transparent); }
    .cu-tile:disabled { opacity: 0.4; cursor: not-allowed; }
    .cu-tier { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 900; color: var(--c); }
    .cu-count { font-size: 11px; color: #94a3b8; font-weight: 700; }
    .cu-be { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; font-size: 13px; font-weight: 900; color: #6ee7b7; }
    .cu-dupes { --c: #f87171; }
    .cu-foot { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; font-size: 11px; color: #64748b; margin-top: 2px; }

    /* ── Grid ── */
    .grid-anchor { scroll-margin-top: 90px; }
    .pick-banner {
        position: sticky; top: 80px; z-index: 30;
        display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 14px; border-radius: 14px;
        background: linear-gradient(90deg, rgba(120,80,6,0.92), rgba(30,22,6,0.92)); border: 1px solid rgba(251,191,36,0.55);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45); backdrop-filter: blur(10px);
    }
    .pb-ico { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #1c1404; background: #fbbf24; flex-shrink: 0; }
    .pb-text { flex: 1; font-size: 13px; color: #fde68a; }
    .pb-text b { color: #fff; }
    .pb-cancel { padding: 7px 14px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 800; color: #fff; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); }
    .pb-cancel:hover { background: rgba(0,0,0,0.5); }
    .grid-head { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
    .gh-count { font-size: 12px; color: #64748b; font-weight: 700; }
    .gh-count b { color: #e2e8f0; font-weight: 900; }
    .gh-reset { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 100px; cursor: pointer; font-size: 11px; font-weight: 800; color: #94a3b8; background: rgba(51,65,85,0.35); border: 1px solid rgba(71,85,105,0.4); }
    .gh-reset:hover { color: #fff; }

    .vt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: transform 0.18s ease; }
    .vt:hover { transform: translateY(-3px); }
    .vt-pin { position: absolute; top: -7px; right: -7px; z-index: 8; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #1c1404; background: linear-gradient(180deg, #fde68a, #f59e0b); box-shadow: 0 2px 8px rgba(0,0,0,0.45); }
    .grid-picking .vt { opacity: 0.5; }
    .grid-picking .vt-pickable { opacity: 1; }
    .grid-picking .vt-pickable :global(.card) { outline: 2px dashed rgba(251,191,36,0.75); outline-offset: 4px; }
    .grid-picking .vt-pickable:hover :global(.card) { outline-style: solid; outline-color: #fbbf24; }

    .vt-bar { display: flex; gap: 4px; width: 180px; padding: 4px; border-radius: 12px; background: rgba(2,6,23,0.65); border: 1px solid rgba(71,85,105,0.3); }
    .vb { width: 30px; height: 28px; flex-shrink: 0; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; background: rgba(30,41,59,0.5); border: 1px solid transparent; transition: color 0.12s, background 0.12s; }
    .vb:hover { color: #e2e8f0; background: rgba(51,65,85,0.7); }
    .vb-fav.vb-on { color: #facc15; background: rgba(250,204,21,0.14); border-color: rgba(250,204,21,0.35); }
    .vb-fav.vb-on :global(svg) { fill: currentColor; }
    .vb-lock.vb-on { color: #fb923c; background: rgba(251,146,60,0.13); border-color: rgba(251,146,60,0.35); }
    .vb-pin.vb-on { color: #fbbf24; background: rgba(251,191,36,0.14); border-color: rgba(251,191,36,0.35); }
    .vb-pin.vb-on :global(svg) { fill: currentColor; }
    .vb-sell { flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 900; color: #6ee7b7; background: rgba(16,185,129,0.1); border: 1px solid rgba(52,211,153,0.22); transition: background 0.12s, color 0.12s; }
    .vb-sell:hover { color: #052e16; background: #34d399; border-color: #34d399; }
    .vb-status { flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; border-radius: 8px; font-size: 11px; font-weight: 800; color: #fb923c; background: rgba(251,146,60,0.06); border: 1px solid rgba(251,146,60,0.15); }
    .vb-status-use { color: #93c5fd; background: rgba(59,130,246,0.08); border-color: rgba(96,165,250,0.2); }

    /* ── Empty ── */
    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 50px 20px; border-radius: 20px; border: 1px dashed rgba(71,85,105,0.4); text-align: center; }
    .empty-ico { width: 58px; height: 58px; border-radius: 18px; display: flex; align-items: center; justify-content: center; color: #38bdf8; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.25); margin-bottom: 6px; }
    .empty-t { font-size: 17px; font-weight: 900; color: #e2e8f0; }
    .empty-s { font-size: 13px; color: #64748b; }
    .empty-btn { position: relative; overflow: hidden; margin-top: 10px; display: inline-flex; align-items: center; gap: 8px; padding: 11px 22px; border-radius: 13px; cursor: pointer; font-size: 13px; font-weight: 900; color: #04131f; background: linear-gradient(180deg, #7dd3fc, #38bdf8); border: none; box-shadow: 0 6px 20px rgba(56,189,248,0.35); }
    .empty-btn-ghost { color: #e2e8f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); box-shadow: none; }

    @media (max-width: 1100px) {
        .vh-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
        .sc-slots { width: 100%; }
    }
    @media (max-width: 600px) {
        .vh { padding: 18px; gap: 16px; }
        .vh-ring { width: 88px; height: 88px; }
        .vr-n { font-size: 21px; }
        .sc { padding: 18px 14px; }
        .sc-slots { gap: 8px; }
        .sc-slot { width: 99px; height: 146px; }
        .sc-card { zoom: 0.55; }
        .sc-plus { width: 34px; height: 34px; }
        .sc-add { font-size: 9px; }
        .sc-remove { opacity: 1; }
        .tb-roles { width: 100%; justify-content: space-between; }
        .rc-l { display: none; }
        /* One swipeable row of chips instead of three wrapped ones. */
        .tb-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -14px; padding: 0 14px; width: calc(100% + 28px); }
        .tb-chips::-webkit-scrollbar { display: none; }
        .chip { flex-shrink: 0; }
        /* global.css forces 16px on selects (iOS zoom), so two per row, sort on its own. */
        .tb-selects { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
        .sel { min-width: 0; height: 40px; }
        .sel:last-child { grid-column: 1 / -1; }
        .pick-banner { top: 64px; }
        /* Two tiles a row on a phone: the whole tile, card and bar together, scales down. */
        .vt { zoom: 0.84; }
    }
</style>
