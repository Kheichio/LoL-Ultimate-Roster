<script>
    import Card from '../card/Card.svelte';

    export let player = null;
    export let onClose = () => {};

    $: color = player?.teamColor || '#3b82f6';
</script>

{#if player}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" on:click|self={onClose}>
    <div class="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl p-6" style="background: linear-gradient(135deg, {color}20 0%, #1e293b 30%); border-color: {color}40;">

        <!-- Header -->
        <div class="flex items-center gap-4 mb-5 pl-3 border-l-4 rounded-l" style="border-color: {color};">
            <div class="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style="background: {color}30; border: 2px solid {color};">
                {player.teamLogo || '🛡️'}
            </div>
            <div>
                <div class="text-2xl font-black text-slate-100">{player.teamName || 'Unknown'}</div>
                <div class="text-sm text-slate-400">{player.displayName || 'Anonymous'}</div>
                <div class="text-xs font-bold" style="color: {color};">{player.prestigeTitle || 'Scout'} · Lv {player.managerLevel || 1}</div>
            </div>
        </div>

        <!-- Primary Stats -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {#each [
                { label: 'Trophy Points', value: player.trophies || 0, color: 'text-amber-400', icon: '🏆' },
                { label: 'Total Power', value: player.totalPower || 0, color: 'text-emerald-400', icon: '⚡' },
                { label: 'Raw Power', value: player.rawPower || 0, color: 'text-blue-300', icon: '💪' },
                { label: 'Blue Essence', value: (player.totalBE || 0).toLocaleString(), color: 'text-blue-400', icon: '💎' },
            ] as stat}
                <div class="bg-slate-900/60 p-3 rounded-xl text-center">
                    <div class="text-lg">{stat.icon}</div>
                    <div class="text-xl font-black {stat.color}">{stat.value}</div>
                    <div class="text-[8px] text-slate-500 uppercase font-bold mt-0.5">{stat.label}</div>
                </div>
            {/each}
        </div>

        <!-- Detailed Stats Grid -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
            {#each [
                { label: 'Cards', value: player.clubSize || 0, color: 'text-slate-200' },
                { label: 'Signatures', value: player.signatureCards || 0, color: 'text-purple-400' },
                { label: 'Holographics', value: player.holographicCards || 0, color: 'text-yellow-300' },
                { label: 'Splits', value: player.splitsCompleted || 0, color: 'text-indigo-400' },
                { label: 'Golden Roads', value: player.goldenRoads || 0, color: 'text-yellow-400' },
                { label: 'Tower Best', value: player.towerBest || 0, color: 'text-red-400' },
            ] as stat}
                <div class="bg-slate-900/40 p-2 rounded-lg text-center">
                    <div class="text-lg font-black {stat.color}">{stat.value}</div>
                    <div class="text-[7px] text-slate-500 uppercase font-bold">{stat.label}</div>
                </div>
            {/each}
        </div>

        <!-- Win/Loss Record -->
        <div class="bg-slate-900/40 p-4 rounded-xl mb-5">
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Career Record</h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                {#each [
                    { label: 'Cafe Wins', value: player.cafeWins || 0, color: 'text-green-400' },
                    { label: 'Regional Wins', value: player.regionalWins || 0, color: 'text-slate-200' },
                    { label: 'MSI Wins', value: player.msiWins || 0, color: 'text-teal-400' },
                    { label: 'Worlds Wins', value: player.worldsWins || 0, color: 'text-amber-400' },
                    { label: 'Draft Wins', value: player.draftWins || 0, color: 'text-cyan-400' },
                    { label: 'Salary Cap', value: player.salaryWins || 0, color: 'text-emerald-400' },
                    { label: 'Total Losses', value: player.losses || 0, color: 'text-red-400' },
                    { label: 'Packs Opened', value: player.packsOpened || 0, color: 'text-orange-300' },
                ] as stat}
                    <div class="flex justify-between bg-slate-800/40 p-2 rounded-lg">
                        <span class="text-slate-500">{stat.label}</span>
                        <span class="{stat.color} font-bold">{stat.value}</span>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Favourite Team / Most Played -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {#if player.favouriteTeam}
                <div class="bg-slate-900/40 p-4 rounded-xl">
                    <h4 class="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2">★ Favourite Team</h4>
                    <div class="text-sm font-black text-slate-200">{player.favouriteTeam}</div>
                </div>
            {/if}
            {#if player.mostPlayedMode}
                <div class="bg-slate-900/40 p-4 rounded-xl">
                    <h4 class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">🎮 Most Played</h4>
                    <div class="text-sm font-black text-slate-200">{player.mostPlayedMode}</div>
                </div>
            {/if}
        </div>

        <!-- Squad -->
        {#if player.squad && Object.values(player.squad).some(Boolean)}
            <div class="mb-5">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Starting Roster</h4>
                <div class="flex flex-wrap gap-2 justify-center">
                    {#each ['TOP','JNG','MID','ADC','SUP','COACH'] as role}
                        {#if player.squad[role]}
                            <div class="relative">
                                <Card card={player.squad[role]} mini={true} />
                                <div class="absolute top-0 left-0 bg-indigo-900/90 text-indigo-200 text-[8px] font-black px-1.5 py-0.5 rounded-tl-xl rounded-br-xl z-10">{role}</div>
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Showcase -->
        {#if player.showcaseCards && player.showcaseCards.length > 0}
            <div class="mb-5">
                <h4 class="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3">🏅 Card Showcase</h4>
                <div class="flex flex-wrap gap-2 justify-center">
                    {#each player.showcaseCards as card}
                        <Card {card} mini={true} />
                    {/each}
                </div>
            </div>
        {/if}

        <button class="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-xl font-bold cursor-pointer transition text-sm" on:click={onClose}>Close</button>
    </div>
</div>
{/if}
