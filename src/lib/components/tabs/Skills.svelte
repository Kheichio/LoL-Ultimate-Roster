<script>
    import { skills, skillPoints, managerXP, managerLevel, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    const skillDefs = [
        { id: 'scouting', name: 'Scouting Network', icon: '🔍', maxLevel: 5,
          desc: 'Improves card quality odds from packs.',
          perLevel: '+0.25% bonus to pack roll RNG per level',
          textColor: 'text-blue-400', barFill: 'bg-blue-500',
          btnActive: 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border-blue-500/40' },
        { id: 'tactics', name: 'Tactical Mastery', icon: '🧠', maxLevel: 5,
          desc: 'Boosts stat checks in tournament matches.',
          perLevel: '+1 to all stat comparisons per level',
          textColor: 'text-purple-400', barFill: 'bg-purple-500',
          btnActive: 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border-purple-500/40' },
        { id: 'transfer', name: 'Transfer Network', icon: '🤝', maxLevel: 5,
          desc: 'Better trade offers and sell prices.',
          perLevel: '+5% sell value per level',
          textColor: 'text-orange-400', barFill: 'bg-orange-500',
          btnActive: 'bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 border-orange-500/40' },
        { id: 'conditioning', name: 'Conditioning', icon: '💪', maxLevel: 5,
          desc: 'Boosts squad chemistry bonuses.',
          perLevel: '+1 max chemistry bonus per level',
          textColor: 'text-emerald-400', barFill: 'bg-emerald-500',
          btnActive: 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border-emerald-500/40' },
        { id: 'mentorship', name: 'Mentorship', icon: '📚', maxLevel: 5,
          desc: 'Increases XP gained from all sources.',
          perLevel: '+10% XP gain per level',
          textColor: 'text-amber-400', barFill: 'bg-amber-500',
          btnActive: 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border-amber-500/40' },
        { id: 'clubhouse', name: 'Club Capacity', icon: '🏟️', maxLevel: 20,
          desc: 'Increases maximum cards in your club.',
          perLevel: '+50 card capacity per level',
          textColor: 'text-cyan-400', barFill: 'bg-cyan-500',
          btnActive: 'bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border-cyan-500/40' },
    ];

    $: xpForNext = $managerLevel * 500;
    $: xpProgress = Math.min(100, ($managerXP / xpForNext) * 100);

    function getSkillCost(skillId) {
        const current = $skills[skillId] || 0;
        return current + 1;
    }

    function upgradeSkill(skillId) {
        const def = skillDefs.find(s => s.id === skillId);
        if (!def) return;
        const current = $skills[skillId] || 0;
        if (current >= def.maxLevel) { showToast('Skill already maxed.', 'error'); return; }
        const cost = getSkillCost(skillId);
        if ($skillPoints < cost) { showToast(`Need ${cost} SP (you have ${$skillPoints}).`, 'error'); return; }

        skillPoints.update(v => v - cost);
        skills.update(s => ({ ...s, [skillId]: current + 1 }));
        playSound('claim');
        showToast(`${def.name} upgraded to level ${current + 1}!`, 'success');
        saveGame();
    }
</script>

<section class="max-w-4xl mx-auto pb-10 pt-2">
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
        <div>
            <h2 class="text-xl font-black text-emerald-400 tracking-wide">Skills & Progression</h2>
            <p class="text-xs text-slate-500 font-mono">Invest Skill Points to power up your management abilities.</p>
        </div>
        <div class="bg-slate-800/60 px-4 py-2 rounded-xl border border-slate-700/40 text-center">
            <div class="text-xl font-black text-yellow-400">{$skillPoints}</div>
            <div class="text-[8px] text-slate-500 uppercase font-bold">SP Available</div>
        </div>
    </div>

    <!-- Level / XP Bar -->
    <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/30 mb-6">
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-3">
                <div class="bg-indigo-600 text-white font-black text-lg w-10 h-10 rounded-lg flex items-center justify-center shadow">{$managerLevel}</div>
                <div>
                    <div class="text-sm font-black text-slate-200">Manager Level {$managerLevel}</div>
                    <div class="text-[10px] text-slate-500">Each level grants 1 Skill Point</div>
                </div>
            </div>
            <div class="text-xs font-mono text-slate-400">{$managerXP} / {xpForNext} XP</div>
        </div>
        <div class="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-600 to-blue-400 h-full rounded-full transition-all duration-500" style="width: {xpProgress}%"></div>
        </div>
        <div class="flex justify-between mt-1.5 text-[9px] text-slate-600">
            <span>Earn XP: Packs (+50), Wins (+200), Trades (+25)</span>
            <span>Lv {$managerLevel + 1} → +1 SP</span>
        </div>
    </div>

    <!-- Skills Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each skillDefs as def}
            {@const current = $skills[def.id] || 0}
            {@const cost = getSkillCost(def.id)}
            {@const maxed = current >= def.maxLevel}
            {@const canAfford = $skillPoints >= cost}
            <div class="bg-slate-800/50 rounded-xl border border-slate-700/30 overflow-hidden">
                <!-- Skill header -->
                <div class="p-4 flex items-start gap-3">
                    <div class="text-2xl mt-0.5 shrink-0">{def.icon}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <h3 class="text-sm font-black text-slate-200">{def.name}</h3>
                            <span class="text-xs font-black {maxed ? 'text-emerald-400' : def.textColor}">{current}/{def.maxLevel}</span>
                        </div>
                        <p class="text-[10px] text-slate-500 mb-2">{def.desc}</p>
                        <p class="text-[9px] {def.textColor} font-bold">{def.perLevel}</p>
                    </div>
                </div>

                <!-- Level dots -->
                <div class="px-4 pb-2">
                    <div class="flex gap-1">
                        {#each Array(def.maxLevel) as _, i}
                            <div class="h-1.5 flex-1 rounded-full {i < current ? def.barFill : 'bg-slate-700'}"></div>
                        {/each}
                    </div>
                </div>

                <!-- Upgrade button -->
                <div class="px-4 pb-4">
                    {#if maxed}
                        <div class="w-full py-2 rounded-lg text-center text-xs font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-700/30">✓ Maxed</div>
                    {:else}
                        <button
                            class="w-full py-2 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition border {
                                canAfford
                                    ? def.btnActive
                                    : 'bg-slate-700/50 text-slate-600 border-slate-700 cursor-not-allowed'
                            }"
                            disabled={!canAfford}
                            on:click={() => upgradeSkill(def.id)}
                        >
                            Upgrade → Lv {current + 1} ({cost} SP)
                        </button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>

    <!-- Skills Summary -->
    <div class="mt-6 bg-slate-800/30 p-4 rounded-xl border border-slate-700/20">
        <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Active Bonuses</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            {#each skillDefs as def}
                {@const current = $skills[def.id] || 0}
                {#if current > 0}
                    <div class="flex justify-between bg-slate-800/40 p-2 rounded-lg">
                        <span class="text-slate-400">{def.icon} {def.name}</span>
                        <span class="{def.textColor} font-bold">Lv {current}</span>
                    </div>
                {/if}
            {/each}
            {#if Object.values($skills).every(v => !v)}
                <div class="col-span-full text-center text-slate-600 py-2">No skills upgraded yet.</div>
            {/if}
        </div>
    </div>
</section>
