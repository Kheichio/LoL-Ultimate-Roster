<script>
    import { skills, skillPoints, managerXP, managerLevel, weightedTrophies, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    const TITLES = [
        { tp: 0, title: 'Scout', color: '#64748b' },
        { tp: 10, title: 'Manager', color: '#94a3b8' },
        { tp: 30, title: 'Director', color: '#60a5fa' },
        { tp: 75, title: 'GM', color: '#a855f7' },
        { tp: 150, title: 'Executive', color: '#10b981' },
        { tp: 250, title: 'President', color: '#f59e0b' },
        { tp: 400, title: 'Hall of Fame', color: '#ec4899' },
        { tp: 600, title: 'Legend', color: '#ef4444' },
        { tp: 1000, title: 'Immortal', color: '#fbbf24' },
    ];

    $: currentTitleIdx = (() => {
        for (let i = TITLES.length - 1; i >= 0; i--) {
            if ($weightedTrophies >= TITLES[i].tp) return i;
        }
        return 0;
    })();
    $: currentTitle = TITLES[currentTitleIdx];
    $: nextTitle = TITLES[currentTitleIdx + 1] || null;

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
        { id: 'stamina', name: 'Stamina', icon: '⏱️', maxLevel: 5,
          desc: 'Reduces cooldown between season split matches.',
          perLevel: '-10s cooldown per level (60s base → 10s min)',
          textColor: 'text-yellow-400', barFill: 'bg-yellow-500',
          btnActive: 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300 border-yellow-500/40' },
        { id: 'mentorship', name: 'Mentorship', icon: '📚', maxLevel: 5,
          desc: 'Increases XP gained from all sources.',
          perLevel: '+10% XP gain per level',
          textColor: 'text-amber-400', barFill: 'bg-amber-500',
          btnActive: 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border-amber-500/40' },
        { id: 'trading', name: 'Trade Mastery', icon: '🔄', maxLevel: 5,
          desc: 'More trade slots, lower card costs, cheaper refreshes.',
          perLevel: 'Lv1-2: +1 slot each · Lv2+: -1 card cost · Lv2/4: refresh discount',
          textColor: 'text-rose-400', barFill: 'bg-rose-500',
          btnActive: 'bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border-rose-500/40' },
        { id: 'bench', name: 'Bench Management', icon: '🪑', maxLevel: 5,
          desc: 'Unlocks bench swap slots during season splits.',
          perLevel: '+1 mid-split swap per level (0 base)',
          textColor: 'text-teal-400', barFill: 'bg-teal-500',
          btnActive: 'bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 border-teal-500/40' },
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

    const colorMap = {
        'text-blue-400': '#60a5fa', 'text-purple-400': '#a855f7', 'text-orange-400': '#fb923c',
        'text-emerald-400': '#34d399', 'text-amber-400': '#fbbf24', 'text-cyan-400': '#22d3ee',
        'text-rose-400': '#fb7185', 'text-yellow-400': '#facc15',
        'bg-blue-500': '#3b82f6', 'bg-purple-500': '#a855f7', 'bg-orange-500': '#f97316',
        'bg-emerald-500': '#10b981', 'bg-amber-500': '#f59e0b', 'bg-cyan-500': '#06b6d4',
        'bg-rose-500': '#f43f5e', 'bg-yellow-500': '#eab308'
    };

    const btnColorMap = {
        'text-blue-400': { bg: 'rgba(37,99,235,0.2)', bgHover: 'rgba(37,99,235,0.4)', text: '#93c5fd', border: 'rgba(59,130,246,0.4)' },
        'text-purple-400': { bg: 'rgba(147,51,234,0.2)', bgHover: 'rgba(147,51,234,0.4)', text: '#d8b4fe', border: 'rgba(168,85,247,0.4)' },
        'text-orange-400': { bg: 'rgba(234,88,12,0.2)', bgHover: 'rgba(234,88,12,0.4)', text: '#fdba74', border: 'rgba(249,115,22,0.4)' },
        'text-emerald-400': { bg: 'rgba(5,150,105,0.2)', bgHover: 'rgba(5,150,105,0.4)', text: '#6ee7b7', border: 'rgba(16,185,129,0.4)' },
        'text-amber-400': { bg: 'rgba(217,119,6,0.2)', bgHover: 'rgba(217,119,6,0.4)', text: '#fcd34d', border: 'rgba(245,158,11,0.4)' },
        'text-cyan-400': { bg: 'rgba(8,145,178,0.2)', bgHover: 'rgba(8,145,178,0.4)', text: '#67e8f9', border: 'rgba(6,182,212,0.4)' },
        'text-rose-400': { bg: 'rgba(244,63,94,0.2)', bgHover: 'rgba(244,63,94,0.4)', text: '#fda4af', border: 'rgba(244,63,94,0.4)' },
        'text-yellow-400': { bg: 'rgba(234,179,8,0.2)', bgHover: 'rgba(234,179,8,0.4)', text: '#fde047', border: 'rgba(234,179,8,0.4)' }
    };
</script>

<section class="skills-page">
    <!-- Header -->
    <div class="skills-header">
        <div>
            <h2 class="skills-title">Skills & Progression</h2>
            <p class="skills-subtitle">Invest Skill Points to power up your management abilities.</p>
        </div>
        <div class="sp-counter">
            <div class="sp-value">{$skillPoints}</div>
            <div class="sp-label">SP Available</div>
        </div>
    </div>

    <!-- Level / XP Bar -->
    <div class="xp-panel">
        <div class="xp-top">
            <div class="xp-left">
                <div class="level-badge">{$managerLevel}</div>
                <div>
                    <div class="level-title">Manager Level {$managerLevel}</div>
                    <div class="level-hint">Each level grants 1 Skill Point</div>
                </div>
            </div>
            <div class="xp-numbers">{$managerXP} / {xpForNext} XP</div>
        </div>
        <div class="xp-track">
            <div class="xp-fill" style="width: {xpProgress}%"></div>
        </div>
        <div class="xp-footer">
            <span>Earn XP: Packs (+50), Wins (+200), Trades (+25)</span>
            <span>Lv {$managerLevel + 1} → +1 SP</span>
        </div>
    </div>

    <!-- Manager Title Progress -->
    <div class="title-panel">
        <div class="title-header">
            <div>
                <div class="title-label">Manager Title</div>
                <div class="title-current" style="color: {currentTitle.color};">{currentTitle.title}</div>
            </div>
            <div class="title-tp">{$weightedTrophies} TP</div>
        </div>
        {#if nextTitle}
            <div class="title-next">Next: <span style="color: {nextTitle.color};">{nextTitle.title}</span> — {nextTitle.tp - $weightedTrophies} TP needed</div>
            <div class="title-bar"><div class="title-fill" style="width: {Math.min(100, (($weightedTrophies - currentTitle.tp) / (nextTitle.tp - currentTitle.tp)) * 100)}%; background: {currentTitle.color};"></div></div>
        {:else}
            <div class="title-max">Maximum title reached!</div>
        {/if}
        <div class="title-list">
            {#each TITLES as t, i}
                {@const achieved = $weightedTrophies >= t.tp}
                {@const isCurrent = i === currentTitleIdx}
                <div class="title-row" class:title-row-done={achieved} class:title-row-current={isCurrent}>
                    <span class="tr-dot" style="background: {achieved ? t.color : '#1e293b'};"></span>
                    <span class="tr-title" style="color: {achieved ? t.color : '#334155'};">{t.title}</span>
                    <span class="tr-req">{t.tp} TP</span>
                    {#if isCurrent}<span class="tr-you">← You</span>{/if}
                </div>
            {/each}
        </div>
        <div class="title-hint">Earn Trophy Points from: Worlds (×6), MSI (×4), First Stand (×2), Regional (×1), Golden Road (×10)</div>
    </div>

    <!-- Skills Grid -->
    <div class="skills-grid">
        {#each skillDefs as def}
            {@const current = $skills[def.id] || 0}
            {@const cost = getSkillCost(def.id)}
            {@const maxed = current >= def.maxLevel}
            {@const canAfford = $skillPoints >= cost}
            {@const accentColor = colorMap[def.textColor] || '#e2e8f0'}
            {@const barColor = colorMap[def.barFill] || '#334155'}
            {@const btn = btnColorMap[def.textColor] || { bg: 'rgba(51,65,85,0.5)', bgHover: 'rgba(51,65,85,0.7)', text: '#94a3b8', border: 'rgba(51,65,85,0.4)' }}
            <div class="skill-card">
                <!-- Skill header -->
                <div class="skill-top">
                    <div class="skill-icon">{def.icon}</div>
                    <div class="skill-info">
                        <div class="skill-name-row">
                            <h3 class="skill-name">{def.name}</h3>
                            <span class="skill-level-count" style="color: {maxed ? '#34d399' : accentColor}">{current}/{def.maxLevel}</span>
                        </div>
                        <p class="skill-desc">{def.desc}</p>
                        <p class="skill-per-level" style="color: {accentColor}">{def.perLevel}</p>
                    </div>
                </div>

                <!-- Level dots -->
                <div class="skill-dots-wrap">
                    <div class="skill-dots">
                        {#each Array(def.maxLevel) as _, i}
                            <div class="skill-dot" style="background: {i < current ? barColor : '#334155'}"></div>
                        {/each}
                    </div>
                </div>

                <!-- Upgrade button -->
                <div class="skill-btn-wrap">
                    {#if maxed}
                        <div class="skill-btn-maxed">✓ Maxed</div>
                    {:else}
                        <button
                            class="skill-btn"
                            style="
                                background: {canAfford ? btn.bg : 'rgba(51,65,85,0.5)'};
                                color: {canAfford ? btn.text : '#475569'};
                                border-color: {canAfford ? btn.border : '#334155'};
                                cursor: {canAfford ? 'pointer' : 'not-allowed'};
                            "
                            disabled={!canAfford}
                            on:click={() => upgradeSkill(def.id)}
                            on:mouseenter={(e) => { if (canAfford) e.currentTarget.style.background = btn.bgHover; }}
                            on:mouseleave={(e) => { if (canAfford) e.currentTarget.style.background = btn.bg; }}
                        >
                            Upgrade → Lv {current + 1} ({cost} SP)
                        </button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>

    <!-- Skills Summary -->
    <div class="summary-panel">
        <h3 class="summary-title">Active Bonuses</h3>
        <div class="summary-grid">
            {#each skillDefs as def}
                {@const current = $skills[def.id] || 0}
                {#if current > 0}
                    <div class="summary-item">
                        <span class="summary-label">{def.icon} {def.name}</span>
                        <span class="summary-value" style="color: {colorMap[def.textColor] || '#e2e8f0'}">Lv {current}</span>
                    </div>
                {/if}
            {/each}
            {#if Object.values($skills).every(v => !v)}
                <div class="summary-empty">No skills upgraded yet.</div>
            {/if}
        </div>
    </div>
</section>

<style>
    .skills-page {
        max-width: 900px;
        margin: 0 auto;
        padding: 8px 0 40px;
    }

    /* ---------- Header ---------- */
    .skills-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
    }
    .skills-title {
        font-size: 22px;
        font-weight: 900;
        color: #34d399;
        letter-spacing: 0.05em;
        margin: 0;
    }
    .skills-subtitle {
        font-size: 12px;
        color: #64748b;
        font-family: monospace;
        margin: 2px 0 0;
    }
    .sp-counter {
        background: rgba(12, 16, 28, 0.5);
        padding: 8px 16px;
        border-radius: 12px;
        border: 1px solid rgba(51, 65, 85, 0.2);
        text-align: center;
    }
    .sp-value {
        font-size: 20px;
        font-weight: 900;
        color: #facc15;
    }
    .sp-label {
        font-size: 8px;
        color: #64748b;
        text-transform: uppercase;
        font-weight: 700;
    }

    /* ---------- XP Panel ---------- */
    .xp-panel {
        background: rgba(12, 16, 28, 0.5);
        padding: 16px;
        border-radius: 12px;
        border: 1px solid rgba(51, 65, 85, 0.2);
        margin-bottom: 24px;
    }
    .xp-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }
    .xp-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .level-badge {
        background: #4f46e5;
        color: #fff;
        font-weight: 900;
        font-size: 18px;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .level-title {
        font-size: 14px;
        font-weight: 900;
        color: #e2e8f0;
    }
    .level-hint {
        font-size: 10px;
        color: #64748b;
    }
    .xp-numbers {
        font-size: 12px;
        font-family: monospace;
        color: #94a3b8;
    }
    .xp-track {
        width: 100%;
        background: #334155;
        border-radius: 9999px;
        height: 10px;
        overflow: hidden;
    }
    .xp-fill {
        height: 100%;
        border-radius: 9999px;
        background: linear-gradient(to right, #4f46e5, #60a5fa);
        transition: width 0.5s ease;
    }
    .xp-footer {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 9px;
        color: #475569;
    }

    /* ---------- Title Panel ---------- */
    .title-panel {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 16px; padding: 20px; margin-bottom: 20px;
    }
    .title-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .title-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    .title-current { font-size: 22px; font-weight: 900; margin-top: 2px; }
    .title-tp { font-size: 18px; font-weight: 900; color: #fbbf24; }
    .title-next { font-size: 11px; color: #64748b; margin-bottom: 8px; }
    .title-bar { width: 100%; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; margin-bottom: 14px; }
    .title-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
    .title-max { font-size: 11px; font-weight: 800; color: #fbbf24; margin-bottom: 14px; }
    .title-list { display: flex; flex-direction: column; gap: 4px; }
    .title-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .title-row-current { font-weight: 900; }
    .tr-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .tr-title { font-size: 12px; font-weight: 700; flex: 1; }
    .tr-req { font-size: 10px; color: #475569; font-family: monospace; }
    .tr-you { font-size: 9px; font-weight: 900; color: #60a5fa; }
    .title-hint { font-size: 9px; color: #334155; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(51,65,85,0.15); }

    /* ---------- Skills Grid ---------- */
    .skills-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
    }
    @media (max-width: 640px) {
        .skills-grid {
            grid-template-columns: 1fr;
        }
    }
    .skill-card {
        background: rgba(12, 16, 28, 0.5);
        border-radius: 12px;
        border: 1px solid rgba(51, 65, 85, 0.2);
        overflow: hidden;
    }

    /* Skill top section */
    .skill-top {
        padding: 16px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
    }
    .skill-icon {
        font-size: 24px;
        margin-top: 2px;
        flex-shrink: 0;
    }
    .skill-info {
        flex: 1;
        min-width: 0;
    }
    .skill-name-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
    }
    .skill-name {
        font-size: 14px;
        font-weight: 900;
        color: #e2e8f0;
        margin: 0;
    }
    .skill-level-count {
        font-size: 12px;
        font-weight: 900;
    }
    .skill-desc {
        font-size: 10px;
        color: #64748b;
        margin: 0 0 8px;
    }
    .skill-per-level {
        font-size: 9px;
        font-weight: 700;
        margin: 0;
    }

    /* Level dots */
    .skill-dots-wrap {
        padding: 0 16px 8px;
    }
    .skill-dots {
        display: flex;
        gap: 4px;
    }
    .skill-dot {
        height: 6px;
        flex: 1;
        border-radius: 9999px;
    }

    /* Upgrade button */
    .skill-btn-wrap {
        padding: 0 16px 16px;
    }
    .skill-btn-maxed {
        width: 100%;
        padding: 8px 0;
        border-radius: 8px;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        background: rgba(6, 78, 59, 0.3);
        color: #34d399;
        border: 1px solid rgba(4, 120, 87, 0.3);
        box-sizing: border-box;
    }
    .skill-btn {
        width: 100%;
        padding: 8px 0;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-width: 1px;
        border-style: solid;
        transition: background 0.15s ease;
        box-sizing: border-box;
    }

    /* ---------- Summary Panel ---------- */
    .summary-panel {
        margin-top: 24px;
        background: rgba(12, 16, 28, 0.5);
        padding: 16px;
        border-radius: 12px;
        border: 1px solid rgba(51, 65, 85, 0.2);
    }
    .summary-title {
        font-size: 10px;
        font-weight: 900;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin: 0 0 12px;
    }
    .summary-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        font-size: 12px;
        font-family: monospace;
    }
    @media (max-width: 640px) {
        .summary-grid {
            grid-template-columns: 1fr 1fr;
        }
    }
    .summary-item {
        display: flex;
        justify-content: space-between;
        background: rgba(12, 16, 28, 0.4);
        padding: 8px;
        border-radius: 8px;
    }
    .summary-label {
        color: #94a3b8;
    }
    .summary-value {
        font-weight: 700;
    }
    .summary-empty {
        grid-column: 1 / -1;
        text-align: center;
        color: #475569;
        padding: 8px 0;
    }
</style>
