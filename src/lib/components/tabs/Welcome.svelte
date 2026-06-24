<script>
    import { switchTab } from '../../stores/ui.js';
    import { hasBoughtStarter } from '../../stores/game.js';
</script>

<section style="max-width:700px; margin:0 auto; padding-bottom:40px;">
    <!-- Hero -->
    <div style="position:relative; background:linear-gradient(160deg, rgba(15,23,50,0.7), rgba(10,14,30,0.8)); padding:48px 32px; border-radius:20px; border:1px solid rgba(79,70,229,0.1); text-align:center; overflow:hidden; margin-bottom:24px; box-shadow:0 0 40px rgba(79,70,229,0.04);">
        <div style="position:absolute; inset:0; background:radial-gradient(ellipse at 50% 0%, rgba(79,70,229,0.06), transparent 70%); pointer-events:none;"></div>
        <div class="relative">
            <div class="text-5xl mb-3">🎮</div>
            <h1 class="text-3xl font-black text-blue-300 uppercase tracking-widest mb-2">LoL Ultimate Roster</h1>
            <p class="text-slate-400 text-sm leading-relaxed max-w-lg mx-auto">Collect esports player cards, build your dream squad, and compete in tournaments — from the Gaming Cafe all the way to the World Championship.</p>
        </div>
    </div>

    <!-- Getting Started Steps -->
    <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-700/50 pb-2">Getting Started</h2>

    <div class="flex gap-4 bg-slate-800/60 p-4 rounded-xl border border-emerald-700/20 items-start">
        <div class="bg-emerald-600 text-white font-black text-lg w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow">1</div>
        <div>
            <h3 class="font-black text-emerald-400 text-base mb-1">Claim Your Starter Pack</h3>
            <p class="text-slate-400 text-xs leading-relaxed mb-2">Head to the Store and grab your free Starter Pack — 6 cards, one per role.</p>
            {#if !$hasBoughtStarter}
                <button class="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-bold cursor-pointer transition text-xs" on:click={() => switchTab('store')}>Open Store →</button>
            {:else}
                <span class="text-emerald-600 text-xs font-bold">✓ Claimed</span>
            {/if}
        </div>
    </div>

    <div class="flex gap-4 bg-slate-800/60 p-4 rounded-xl border border-blue-700/20 items-start">
        <div class="bg-blue-600 text-white font-black text-lg w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow">2</div>
        <div>
            <h3 class="font-black text-blue-400 text-base mb-1">Build Your Squad</h3>
            <p class="text-slate-400 text-xs leading-relaxed mb-2">Assign players to TOP, JNG, MID, ADC, and SUP. You need all 5 to compete.</p>
            <button class="bg-blue-700 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold cursor-pointer transition text-xs" on:click={() => switchTab('squad')}>Build Squad →</button>
        </div>
    </div>

    <div class="flex gap-4 bg-slate-800/60 p-4 rounded-xl border border-yellow-700/20 items-start">
        <div class="bg-yellow-500 text-slate-900 font-black text-lg w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow">3</div>
        <div>
            <h3 class="font-black text-yellow-400 text-base mb-1">Enter a Tournament</h3>
            <p class="text-slate-400 text-xs leading-relaxed mb-2">Hit PLAY and enter the Gaming Cafe Tournament — free entry, win BE to buy more packs.</p>
            <button class="bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-4 py-1.5 rounded-lg font-bold cursor-pointer transition text-xs" on:click={() => switchTab('tournament')}>Go Play →</button>
        </div>
    </div>
</section>
