<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, makeUniqueId, TIER_ORDER, ALL_SPECIAL } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    const upgradePaths = [
        { from: 'Bronze', to: 'Silver', count: 10, cost: 50 },
        { from: 'Silver', to: 'Gold', count: 10, cost: 100 },
        { from: 'Gold', to: 'Platinum', count: 10, cost: 200 },
        { from: 'Platinum', to: 'Diamond', count: 8, cost: 400 },
        { from: 'Diamond', to: 'Master', count: 8, cost: 800 },
        { from: 'Master', to: 'Grandmaster', count: 5, cost: 1500 },
        { from: 'Grandmaster', to: 'Challenger', count: 5, cost: 3000 },
    ];

    const roles = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
    const roleIcons = {
        TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png',
        ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png'
    };

    let selectedPath = upgradePaths[0];
    let selectedRole = 'TOP';
    let showResult = false;
    let resultCard = null;

    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));

    $: eligible = $club.filter(c =>
        c.quality === selectedPath.from &&
        c.role === selectedRole &&
        !activeSquadIds.has(c.uniqueId) &&
        !c.locked &&
        !ALL_SPECIAL.includes(c.quality)
    ).sort((a, b) => a.rating - b.rating);

    $: canUpgrade = eligible.length >= selectedPath.count && $blueEssence >= selectedPath.cost;

    $: pathCounts = (() => {
        const counts = {};
        upgradePaths.forEach(p => {
            const byRole = {};
            roles.forEach(r => {
                byRole[r] = $club.filter(c =>
                    c.quality === p.from && c.role === r &&
                    !activeSquadIds.has(c.uniqueId) && !c.locked && !ALL_SPECIAL.includes(c.quality)
                ).length;
            });
            counts[p.from] = byRole;
        });
        return counts;
    })();

    function performUpgrade() {
        if (!canUpgrade) return;

        const db = getDB();
        if (!db) return;

        const toConsume = eligible.slice(0, selectedPath.count);
        const consumeIds = new Set(toConsume.map(c => c.uniqueId));

        let pool = db.filter(p =>
            p.quality === selectedPath.to &&
            p.role === selectedRole &&
            !ALL_SPECIAL.includes(p.quality)
        );
        if (pool.length === 0) pool = db.filter(p => p.quality === selectedPath.to && !ALL_SPECIAL.includes(p.quality));
        if (pool.length === 0) { showToast('No cards available for this upgrade tier.', 'error'); return; }

        const pick = pool[Math.floor(Math.random() * pool.length)];
        const newCard = { ...pick, uniqueId: makeUniqueId('upg_') };

        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        blueEssence.update(v => v - selectedPath.cost);
        trackStats.update(s => ({ ...s, upgradesPerformed: (s.upgradesPerformed || 0) + 1 }));

        playSound('rare');
        resultCard = newCard;
        showResult = true;
        saveGame();
        showToast(`Upgraded to ${newCard.name} (${selectedPath.to})!`, 'success');
    }

    function closeResult() {
        showResult = false;
        resultCard = null;
    }
</script>

<section class="max-w-4xl mx-auto pb-10 pt-2">
    <h2 class="text-xl font-black text-yellow-400 tracking-wide mb-1">Upgrade Lab</h2>
    <p class="text-xs text-slate-500 mb-5">Combine cards of the same role and tier to forge a higher-tier card.</p>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Left: Upgrade Path Selector -->
        <div class="lg:col-span-1 space-y-3">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Upgrade</h3>
            {#each upgradePaths as path}
                {@const isSelected = selectedPath.from === path.from}
                <button
                    class="w-full text-left p-3 rounded-xl border cursor-pointer transition {
                        isSelected
                            ? 'bg-yellow-900/20 border-yellow-600/40 shadow-inner'
                            : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/40'
                    }"
                    on:click={() => { selectedPath = path; }}
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-black {isSelected ? 'text-yellow-300' : 'text-slate-300'}">
                            {path.from} → {path.to}
                        </span>
                        <span class="text-[9px] font-mono text-slate-500">{path.cost} BE</span>
                    </div>
                    <div class="text-[9px] text-slate-500">
                        Requires {path.count} × {path.from} cards (same role)
                    </div>
                </button>
            {/each}
        </div>

        <!-- Center + Right: Role + Preview -->
        <div class="lg:col-span-2 space-y-4">
            <!-- Role Selector -->
            <div class="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30">
                <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Select Role</h3>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {#each roles as role}
                        {@const count = pathCounts[selectedPath.from]?.[role] || 0}
                        {@const enough = count >= selectedPath.count}
                        <button
                            class="p-3 rounded-xl text-center cursor-pointer transition border {
                                selectedRole === role
                                    ? 'bg-blue-900/30 border-blue-500/50'
                                    : 'bg-slate-800/60 border-slate-700/40 hover:bg-slate-700/50'
                            }"
                            on:click={() => { selectedRole = role; }}
                        >
                            <img src={roleIcons[role]} alt={role} class="w-6 h-6 mx-auto mb-1 {selectedRole === role ? 'opacity-100' : 'opacity-40'}">
                            <div class="text-[10px] font-black {selectedRole === role ? 'text-blue-300' : 'text-slate-500'}">{role}</div>
                            <div class="text-[9px] font-mono {enough ? 'text-emerald-400' : 'text-slate-600'}">{count}/{selectedPath.count}</div>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Upgrade Summary -->
            <div class="bg-slate-800/40 p-5 rounded-xl border border-slate-700/30">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upgrade Preview</h3>
                </div>

                <div class="flex items-center justify-center gap-4 mb-5">
                    <!-- From -->
                    <div class="text-center">
                        <div class="w-20 h-28 bg-slate-700/40 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center">
                            <div class="text-lg font-black text-slate-500">{selectedPath.count}×</div>
                            <div class="text-[9px] text-slate-600 font-bold">{selectedPath.from}</div>
                        </div>
                        <div class="text-[9px] text-slate-500 mt-1 font-mono">{selectedRole}</div>
                    </div>

                    <!-- Arrow -->
                    <div class="flex flex-col items-center gap-1">
                        <div class="text-xl text-yellow-500">→</div>
                        <div class="text-[9px] text-slate-500 font-mono">{selectedPath.cost} BE</div>
                    </div>

                    <!-- To -->
                    <div class="text-center">
                        <div class="w-20 h-28 bg-yellow-900/20 border-2 border-yellow-600/40 rounded-xl flex flex-col items-center justify-center">
                            <div class="text-lg font-black text-yellow-400">?</div>
                            <div class="text-[9px] text-yellow-600 font-bold">{selectedPath.to}</div>
                        </div>
                        <div class="text-[9px] text-yellow-500 mt-1 font-mono">Random {selectedRole}</div>
                    </div>
                </div>

                <!-- Status -->
                <div class="space-y-1.5 mb-4 text-xs">
                    <div class="flex justify-between py-1 px-2 rounded bg-slate-900/40">
                        <span class="text-slate-500">Cards available</span>
                        <span class="{eligible.length >= selectedPath.count ? 'text-emerald-400' : 'text-red-400'} font-bold">{eligible.length} / {selectedPath.count}</span>
                    </div>
                    <div class="flex justify-between py-1 px-2 rounded bg-slate-900/40">
                        <span class="text-slate-500">Cost</span>
                        <span class="{$blueEssence >= selectedPath.cost ? 'text-emerald-400' : 'text-red-400'} font-bold">{selectedPath.cost} BE</span>
                    </div>
                    <div class="flex justify-between py-1 px-2 rounded bg-slate-900/40">
                        <span class="text-slate-500">Your balance</span>
                        <span class="text-blue-400 font-bold">{$blueEssence} BE</span>
                    </div>
                </div>

                <!-- Upgrade button -->
                <button
                    class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest cursor-pointer transition {
                        canUpgrade
                            ? 'bg-yellow-600 hover:bg-yellow-500 text-slate-900 shadow-lg'
                            : 'bg-slate-700 text-slate-600 cursor-not-allowed'
                    }"
                    disabled={!canUpgrade}
                    on:click={performUpgrade}
                >
                    {#if eligible.length < selectedPath.count}
                        Need {selectedPath.count - eligible.length} more {selectedPath.from} {selectedRole} cards
                    {:else if $blueEssence < selectedPath.cost}
                        Need {selectedPath.cost - $blueEssence} more BE
                    {:else}
                        Upgrade {selectedPath.count}× {selectedPath.from} → 1× {selectedPath.to}
                    {/if}
                </button>
            </div>

            <!-- Cards that would be consumed -->
            {#if eligible.length > 0}
                <div class="bg-slate-800/30 p-4 rounded-xl border border-slate-700/20">
                    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                        Eligible Cards ({eligible.length})
                        {#if eligible.length >= selectedPath.count}
                            <span class="text-red-400 ml-1">— lowest {selectedPath.count} will be consumed</span>
                        {/if}
                    </h3>
                    <div class="flex flex-wrap gap-2 justify-center">
                        {#each eligible as card, i (card.uniqueId)}
                            <div class="relative">
                                <Card {card} mini={true} />
                                {#if i < selectedPath.count}
                                    <div class="absolute inset-0 bg-red-900/40 rounded-xl flex items-center justify-center">
                                        <span class="text-red-300 text-xs font-black bg-red-950/80 px-2 py-1 rounded">CONSUMED</span>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</section>

<!-- Result Overlay -->
{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4" on:click={closeResult}>
    <div class="text-xs font-black text-yellow-400 uppercase tracking-widest mb-4">Upgrade Complete!</div>
    <div class="animate-card-reveal">
        <Card card={resultCard} />
    </div>
    <button class="mt-6 bg-slate-700 hover:bg-slate-600 text-slate-200 px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click|stopPropagation={closeResult}>
        Continue
    </button>
</div>
{/if}

<style>
    .animate-card-reveal {
        animation: upgradeReveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes upgradeReveal {
        from { opacity: 0; transform: scale(0.5) rotateY(90deg); }
        to { opacity: 1; transform: scale(1) rotateY(0deg); }
    }
</style>
