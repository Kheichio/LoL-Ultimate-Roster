<script>
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { skills, skillPoints, managerXP, managerLevel, weightedTrophies, prestige, prestigeManager, checkMilestoneCards, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { SCOUT_STEP, tradeMastery } from '../../utils/skillEffects.js';

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
    $: titlePct = nextTitle ? Math.min(100, (($weightedTrophies - currentTitle.tp) / (nextTitle.tp - currentTitle.tp)) * 100) : 100;

    // `effect(level)` is what the skill does AT that level, read from the code that applies it
    // (stores/game.js, utils/cards.js, utils/combat.js, utils/skillEffects.js, Season.svelte).
    // A skill with no `effect` shows its `perLevel` text instead.
    const GROUPS = [
        { id: 'match', label: 'Matches', icon: 'swords', c: '#a78bfa', note: 'Win more of them' },
        { id: 'reward', label: 'Rewards', icon: 'gem', c: '#38bdf8', note: 'Get more out of every win' },
        { id: 'collect', label: 'Collection', icon: 'cards', c: '#34d399', note: 'Packs and room for your cards' },
    ];
    const skillDefs = [
        { id: 'tactics', group: 'match', name: 'Tactical Mastery', icon: 'target', c: '#a855f7', maxLevel: 5,
          desc: 'Sharper calls in every match.',
          effect: lv => `+${lv} to every play's stat` },
        { id: 'conditioning', group: 'match', name: 'Conditioning', icon: 'bolt', c: '#34d399', maxLevel: 5,
          desc: 'Fitter players — flat Power in every match.',
          effect: lv => `+${lv} squad Power` },
        { id: 'stamina', group: 'match', name: 'Stamina', icon: 'clock', c: '#facc15', maxLevel: 5,
          desc: 'Less waiting between season split matches.',
          effect: lv => `${Math.max(10, 60 - lv * 10)}s between split matches` },
        { id: 'bench', group: 'match', name: 'Bench Management', icon: 'squad', c: '#2dd4bf', maxLevel: 3,
          desc: 'Substitutes you can swap in during a split.',
          effect: lv => lv === 0 ? 'No bench slots' : `${lv} bench slot${lv === 1 ? '' : 's'}` },
        { id: 'wealth', group: 'reward', name: 'Wealth Management', icon: 'gem', c: '#38bdf8', maxLevel: 5,
          desc: 'More BE from tournament wins, season splits and quests.',
          effect: lv => `+${lv * 10}% BE from rewards` },
        { id: 'mentorship', group: 'reward', name: 'Mentorship', icon: 'academy', c: '#fbbf24', maxLevel: 5,
          desc: 'More XP from every source.',
          effect: lv => `+${lv * 10}% XP` },
        { id: 'transfer', group: 'reward', name: 'Transfer Network', icon: 'coins', c: '#fb923c', maxLevel: 5,
          desc: 'Better prices when you sell cards.',
          effect: lv => `+${lv * 5}% card sell value` },
        { id: 'trading', group: 'reward', name: 'Trade Mastery', icon: 'trade', c: '#fb7185', maxLevel: 5,
          desc: 'More listings on the Transfer Market, and cheaper signings.',
          effect: lv => {
              const t = tradeMastery(lv);
              return `${6 + t.extraListings} listings${t.cardDiscount ? ` · −${t.cardDiscount} card${t.cardDiscount === 1 ? '' : 's'}` : ''} · −${Math.round(t.beDiscount * 100)}% BE`;
          } },
        { id: 'scouting', group: 'collect', name: 'Scouting Network', icon: 'search', c: '#60a5fa', maxLevel: 5,
          desc: 'Rarer cards from every pack.',
          effect: lv => `+${Math.round(lv * SCOUT_STEP * 100)}% odds on every tier above a pack's lowest` },
        { id: 'bulk', group: 'collect', name: 'Bulk Opening', icon: 'store', c: '#818cf8', maxLevel: 4,
          desc: 'Open several packs of one type in a single click.',
          effect: lv => lv === 0 ? 'One pack at a time' : `Up to ${1 + lv} packs at once` },
        { id: 'clubhouse', group: 'collect', name: 'Club Capacity', icon: 'club', c: '#22d3ee', maxLevel: 20,
          desc: 'Room for more cards in your Club Vault.',
          effect: lv => `${100 + lv * 50} card capacity` },
    ];

    // Where XP actually comes from — every grantXP() call in the roster shell.
    const XP_SOURCES = [
        { icon: 'store', label: 'Opening packs', value: '+50 a pack' },
        { icon: 'trophy', label: 'Tournament runs', value: '+100 Cafe → +800 Worlds', note: '40% if you go out' },
        { icon: 'crown', label: 'Golden Road', value: '+2,000' },
        { icon: 'calendar', label: 'Season matches', value: '+150 a win · +60 a loss' },
        { icon: 'puzzle', label: 'Draft', value: '+300 a win · +100 a loss' },
        { icon: 'tower', label: 'Infinity Tower', value: '+50 + 5 per floor cleared' },
        { icon: 'academy', label: 'Academy runs', value: '+4 per rating point' },
        { icon: 'archive', label: 'Archive', value: '+10 a new card · +50 a full team' },
    ];

    $: xpForNext = $managerLevel * 500;
    $: xpProgress = Math.min(100, ($managerXP / xpForNext) * 100);
    $: mentorLevel = $skills.mentorship || 0;

    function getSkillCost(skillId) {
        if (skillId === 'clubhouse') return 1;
        const current = $skills[skillId] || 0;
        return current + 1;
    }
    // SP a skill has absorbed so far: 1 + 2 + … + level (Club Capacity is a flat 1 per level).
    const spentOn = (def, lv) => (def.id === 'clubhouse' ? lv : (lv * (lv + 1)) / 2);
    $: spInvested = skillDefs.reduce((s, d) => s + spentOn(d, $skills[d.id] || 0), 0);
    $: spTotal = skillDefs.reduce((s, d) => s + spentOn(d, d.maxLevel), 0);
    $: maxedCount = skillDefs.filter(d => ($skills[d.id] || 0) >= d.maxLevel).length;
    $: affordable = skillDefs.filter(d => ($skills[d.id] || 0) < d.maxLevel && $skillPoints >= getSkillCost(d.id)).length;

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

    function doPrestige() {
        openConfirmModal(
            `Prestige ${$prestige + 1}? This resets your Level, XP and every skill to 0. You keep all cards, BE and trophies.`,
            () => {
                if (prestigeManager()) {
                    checkMilestoneCards();
                    saveGame();
                    showToast(`Prestige ${$prestige}! Skills reset. You keep everything else.`, 'success');
                }
            }
        );
    }
</script>

<section class="sk">
    <!-- ═══ Hero ═══ -->
    <header class="skh">
        <div class="skh-glow" aria-hidden="true"></div>
        <div class="skh-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="ring-bg" cx="60" cy="60" r="52" />
                <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {xpProgress * 3.267} 999;" />
            </svg>
            <span class="lv-l">Level</span>
            <span class="lv-n">{$managerLevel}</span>
        </div>
        <div class="skh-text">
            <span class="skh-eyebrow"><Icon name="skills" size={12} stroke={2.2} /> Progression
                {#if $prestige > 0}<span class="pr-tag"><Icon name="star" size={11} stroke={2.4} /> Prestige {$prestige}</span>{/if}
            </span>
            <h2 class="skh-title">Skills & Progression</h2>
            <p class="skh-sub">Every manager level gives you a Skill Point. Spend them on permanent upgrades for your club.</p>
            <div class="xp">
                <div class="xp-bar"><div class="xp-fill" style="width: {xpProgress}%;"></div></div>
                <div class="xp-meta"><span><b>{$managerXP.toLocaleString()}</b> / {xpForNext.toLocaleString()} XP</span><span>{(xpForNext - $managerXP).toLocaleString()} XP to level {$managerLevel + 1}</span></div>
            </div>
        </div>
        <div class="skh-sp" class:skh-sp-on={affordable > 0}>
            <span class="sp-n">{$skillPoints}</span>
            <span class="sp-l">Skill point{$skillPoints === 1 ? '' : 's'}</span>
            <span class="sp-note">{affordable > 0 ? `${affordable} upgrade${affordable === 1 ? '' : 's'} ready` : maxedCount === skillDefs.length ? 'Every skill maxed' : 'Level up to earn more'}</span>
        </div>
    </header>

    <div class="row">
        <!-- Manager title -->
        <section class="panel title-p">
            <div class="p-head">
                <span class="p-ico" style="--c: {currentTitle.color};"><Icon name="medal" size={15} /></span>
                <span class="p-title">Manager title</span>
                <span class="p-note">Glory {$weightedTrophies}</span>
            </div>
            <div class="tt-now">
                <span class="tt-name" style="color: {currentTitle.color};">{currentTitle.title}</span>
                {#if nextTitle}
                    <span class="tt-next">{nextTitle.tp - $weightedTrophies} more to <b style="color: {nextTitle.color};">{nextTitle.title}</b></span>
                {:else}
                    <span class="tt-next">The highest title there is.</span>
                {/if}
            </div>
            <div class="tt-bar"><div class="tt-fill" style="width: {titlePct}%; background: {currentTitle.color};"></div></div>
            <div class="ladder">
                {#each TITLES as t, i}
                    <div class="lr" class:lr-done={i < currentTitleIdx} class:lr-now={i === currentTitleIdx} style="--c: {t.color};" title="{t.title} · {t.tp} TP">
                        <span class="lr-dot"></span>
                        <span class="lr-name">{t.title}</span>
                        <span class="lr-tp">{t.tp}</span>
                    </div>
                {/each}
            </div>
            <p class="p-foot">Trophy points: Worlds ×6 · MSI ×4 · First Stand ×2 · Regional ×1 · Golden Road ×10.</p>
        </section>

        <!-- How to earn XP -->
        <section class="panel">
            <div class="p-head">
                <span class="p-ico" style="--c: #818cf8;"><Icon name="trend" size={15} /></span>
                <span class="p-title">Earning XP</span>
                {#if mentorLevel > 0}<span class="p-note p-note-on">+{mentorLevel * 10}% from Mentorship</span>{/if}
            </div>
            <div class="src">
                {#each XP_SOURCES as s}
                    <div class="src-row">
                        <span class="src-ico"><Icon name={s.icon} size={14} /></span>
                        <span class="src-label">{s.label}{#if s.note}<span class="src-note">{s.note}</span>{/if}</span>
                        <span class="src-val">{s.value}</span>
                    </div>
                {/each}
            </div>
            <p class="p-foot">Every match game also gives a little XP. Level N needs N × 500 XP.</p>
        </section>
    </div>

    <!-- ═══ Skill tree ═══ -->
    <div class="tree-head">
        <h3 class="tree-title">Skills</h3>
        <span class="tree-meta"><b>{spInvested}</b> / {spTotal} SP invested · {maxedCount} of {skillDefs.length} maxed</span>
        <span class="tree-hint">Each level costs one more SP than the last · Club Capacity is always 1 SP</span>
    </div>

    {#each GROUPS as g (g.id)}
        <section class="grp" style="--g: {g.c};">
            <div class="grp-head"><span class="grp-ico"><Icon name={g.icon} size={14} stroke={2.2} /></span><span class="grp-label">{g.label}</span><span class="grp-note">{g.note}</span></div>
            <div class="grid">
                {#each skillDefs.filter(d => d.group === g.id) as def (def.id)}
                    {@const current = $skills[def.id] || 0}
                    {@const cost = getSkillCost(def.id)}
                    {@const maxed = current >= def.maxLevel}
                    {@const canAfford = $skillPoints >= cost}
                    <article class="skc" class:skc-max={maxed} class:skc-ready={!maxed && canAfford} style="--c: {def.c};">
                        <div class="skc-top">
                            <span class="skc-ico"><Icon name={def.icon} size={20} stroke={2} /></span>
                            <div class="skc-titles">
                                <h4 class="skc-name">{def.name}</h4>
                                <p class="skc-desc">{def.desc}</p>
                            </div>
                            <span class="skc-lv">{current}<span>/{def.maxLevel}</span></span>
                        </div>

                        <div class="pips" class:pips-many={def.maxLevel > 6}>
                            {#each Array(def.maxLevel) as _, i}<span class="pip" class:pip-on={i < current}></span>{/each}
                        </div>

                        {#if def.effect}
                            <div class="fx">
                                <div class="fx-row"><span class="fx-k">Now</span><span class="fx-v" class:fx-v-dim={current === 0}>{current === 0 ? 'Not learned' : def.effect(current)}</span></div>
                                {#if !maxed}<div class="fx-row fx-next"><span class="fx-k">Next</span><span class="fx-v">{def.effect(current + 1)}</span></div>{/if}
                            </div>
                        {:else}
                            <div class="fx"><div class="fx-row"><span class="fx-v fx-v-plain">{def.perLevel}</span></div></div>
                        {/if}

                        {#if maxed}
                            <div class="skc-maxed"><Icon name="check" size={14} stroke={2.8} /> Maxed</div>
                        {:else}
                            <button class="skc-btn" disabled={!canAfford} on:click={() => upgradeSkill(def.id)} use:pressFx={{ color: 'rgba(255,255,255,0.35)' }}>
                                {#if canAfford}<Icon name="upgrade" size={14} stroke={2.4} /> Upgrade to Lv {current + 1} · {cost} SP
                                {:else}<Icon name="lock" size={13} stroke={2.2} /> Needs {cost} SP{/if}
                            </button>
                        {/if}
                    </article>
                {/each}
            </div>
        </section>
    {/each}

    <!-- ═══ Prestige ═══ -->
    {#if $managerLevel >= 100 || $prestige > 0}
        <section class="pr">
            <div class="pr-stars" aria-hidden="true">
                {#each Array(Math.max(1, Math.min($prestige, 5))) as _, i}<span class="pr-star" class:pr-star-off={$prestige === 0}><Icon name="star" size={22} stroke={1.8} /></span>{/each}
            </div>
            <div class="pr-text">
                <span class="pr-eyebrow">Manager Prestige{$prestige > 0 ? ` · ${$prestige} earned` : ''}</span>
                <h3 class="pr-title">{$managerLevel >= 100 ? `Prestige ${$prestige + 1} is ready` : `Prestige ${$prestige}`}</h3>
                <p class="pr-desc">At level 100, reset your level, XP and skills for a Prestige star and a Hall of Champions badge. Cards, BE and trophies are kept.</p>
            </div>
            {#if $managerLevel >= 100}
                <button class="pr-btn" on:click={doPrestige} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}><Icon name="star" size={15} stroke={2.4} /> Prestige {$prestige + 1}</button>
            {:else}
                <span class="pr-locked">Next at level 100 · you are {$managerLevel}</span>
            {/if}
        </section>
    {/if}
</section>

<style>
    .sk { display: flex; flex-direction: column; gap: 16px; max-width: 1200px; margin: 0 auto; padding-bottom: 40px; }

    /* ── Hero ── */
    .skh {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(129,140,248,0.18), transparent 65%), linear-gradient(120deg, #10102a, #0b0e1a 60%);
        border: 1px solid rgba(129,140,248,0.28);
    }
    .skh-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(250,204,21,0.1), transparent 65%); }
    .skh-ring { position: relative; width: 112px; height: 112px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .skh-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 10; }
    .ring-fg { fill: none; stroke: #818cf8; stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(129,140,248,0.6)); transition: stroke-dasharray 0.6s ease; }
    .lv-l { position: relative; font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
    .lv-n { position: relative; font-size: 34px; font-weight: 900; color: #eef2ff; line-height: 1; font-variant-numeric: tabular-nums; }
    .skh-text { position: relative; flex: 1; min-width: 260px; }
    .skh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #818cf8; }
    .pr-tag { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; padding: 2px 8px; border-radius: 100px; letter-spacing: 1px; color: #1c1404; background: #fbbf24; }
    .skh-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .skh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .xp { margin-top: 12px; max-width: 520px; }
    .xp-bar { height: 8px; border-radius: 8px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .xp-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #6366f1, #a5b4fc); transition: width 0.5s ease; }
    .xp-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 5px; font-size: 11px; color: #64748b; font-weight: 700; flex-wrap: wrap; }
    .xp-meta b { color: #e2e8f0; }
    .skh-sp { position: relative; display: flex; flex-direction: column; align-items: center; min-width: 150px; padding: 14px 18px; border-radius: 20px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.16); }
    .skh-sp-on { border-color: rgba(250,204,21,0.5); background: radial-gradient(circle at 50% 0%, rgba(250,204,21,0.18), transparent 70%), rgba(2,6,23,0.5); box-shadow: 0 0 30px rgba(250,204,21,0.12); }
    .sp-n { font-size: 40px; font-weight: 900; line-height: 1; color: #fde68a; font-variant-numeric: tabular-nums; }
    .sp-l { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #a1a1aa; margin-top: 4px; }
    .sp-note { font-size: 11px; color: #64748b; margin-top: 6px; font-weight: 700; }
    .skh-sp-on .sp-note { color: #facc15; }

    /* ── Panels ── */
    .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .panel { padding: 16px; border-radius: 20px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .p-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; flex-wrap: wrap; }
    .p-ico { width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .p-title { font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #e2e8f0; }
    .p-note { margin-left: auto; font-size: 11px; font-weight: 700; color: #64748b; }
    .p-note-on { color: #fbbf24; }
    .p-foot { margin-top: 10px; font-size: 11px; color: #64748b; line-height: 1.5; }

    .tt-now { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .tt-name { font-size: 26px; font-weight: 900; letter-spacing: -0.3px; }
    .tt-next { font-size: 12px; color: #94a3b8; }
    .tt-bar { height: 6px; border-radius: 6px; margin: 8px 0 14px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .tt-fill { height: 100%; border-radius: 6px; transition: width 0.5s; }
    .ladder { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
    .lr { display: flex; align-items: center; gap: 7px; padding: 7px 9px; border-radius: 10px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); opacity: 0.55; }
    .lr-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: rgba(71,85,105,0.6); }
    .lr-name { flex: 1; min-width: 0; font-size: 12px; font-weight: 800; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lr-tp { font-size: 10px; font-weight: 800; color: #475569; font-variant-numeric: tabular-nums; }
    .lr-done { opacity: 0.85; }
    .lr-done .lr-dot { background: var(--c); }
    .lr-now { opacity: 1; border-color: color-mix(in srgb, var(--c) 60%, transparent); background: color-mix(in srgb, var(--c) 12%, rgba(15,23,42,0.55)); }
    .lr-now .lr-dot { background: var(--c); box-shadow: 0 0 8px var(--c); }
    .lr-now .lr-name, .lr-done .lr-name { color: var(--c); }

    .src { display: flex; flex-direction: column; gap: 5px; }
    .src-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .src-ico { width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #a5b4fc; background: rgba(129,140,248,0.12); }
    .src-label { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12px; font-weight: 800; color: #e2e8f0; }
    .src-note { font-size: 10px; font-weight: 600; color: #64748b; }
    .src-val { font-size: 12px; font-weight: 900; color: #c7d2fe; text-align: right; }

    /* ── Skill tree ── */
    .tree-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 6px; padding: 0 4px; }
    .tree-title { font-size: 20px; font-weight: 900; color: #fff; }
    .tree-meta { font-size: 12px; color: #64748b; font-weight: 700; }
    .tree-meta b { color: #fde68a; }
    .tree-hint { margin-left: auto; font-size: 11px; color: #475569; }
    .grp { padding: 14px; border-radius: 20px; background: linear-gradient(170deg, color-mix(in srgb, var(--g) 7%, rgba(12,16,28,0.75)), rgba(10,13,24,0.75) 45%); border: 1px solid color-mix(in srgb, var(--g) 22%, rgba(71,85,105,0.2)); }
    .grp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .grp-ico { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--g); background: color-mix(in srgb, var(--g) 15%, transparent); }
    .grp-label { font-size: 13px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: var(--g); }
    .grp-note { font-size: 11px; color: #64748b; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }

    .skc { display: flex; flex-direction: column; gap: 11px; padding: 14px; border-radius: 16px; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.3); transition: border-color 0.15s, transform 0.15s; }
    .skc:hover { border-color: color-mix(in srgb, var(--c) 45%, transparent); }
    .skc-ready { border-color: color-mix(in srgb, var(--c) 40%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 12%, transparent), 0 8px 24px color-mix(in srgb, var(--c) 8%, transparent); }
    .skc-max { background: linear-gradient(160deg, color-mix(in srgb, var(--c) 10%, transparent), rgba(2,6,23,0.5) 60%); border-color: color-mix(in srgb, var(--c) 35%, transparent); }
    .skc-top { display: flex; align-items: flex-start; gap: 11px; }
    .skc-ico { width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .skc-titles { flex: 1; min-width: 0; }
    .skc-name { font-size: 14px; font-weight: 900; color: #f1f5f9; }
    .skc-desc { font-size: 11px; color: #64748b; margin-top: 2px; line-height: 1.4; }
    .skc-lv { font-size: 18px; font-weight: 900; color: var(--c); font-variant-numeric: tabular-nums; }
    .skc-lv span { font-size: 11px; color: #475569; }
    .pips { display: flex; gap: 4px; }
    .pip { flex: 1; height: 6px; border-radius: 6px; background: rgba(51,65,85,0.6); }
    .pips-many { gap: 2px; }
    .pips-many .pip { height: 5px; border-radius: 3px; }
    .pip-on { background: var(--c); box-shadow: 0 0 6px color-mix(in srgb, var(--c) 50%, transparent); }
    .fx { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 11px; background: rgba(15,23,42,0.6); }
    .fx-row { display: flex; align-items: baseline; gap: 8px; }
    .fx-k { width: 34px; flex-shrink: 0; font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #475569; }
    .fx-v { font-size: 12px; font-weight: 800; color: #e2e8f0; }
    .fx-v-dim { color: #64748b; }
    .fx-next .fx-v { color: var(--c); }
    .fx-v-plain { font-size: 11px; font-weight: 700; color: #94a3b8; line-height: 1.4; }
    .skc-btn {
        position: relative; overflow: hidden; margin-top: auto; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        width: 100%; padding: 10px; border-radius: 12px; cursor: pointer; font-size: 12px; font-weight: 900;
        color: #0b1020; border: none; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c));
        box-shadow: 0 6px 18px color-mix(in srgb, var(--c) 30%, transparent);
    }
    .skc-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .skc-btn:disabled { cursor: not-allowed; color: #64748b; background: rgba(30,41,59,0.6); box-shadow: none; border: 1px solid rgba(71,85,105,0.35); }
    .skc-maxed { margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px; border-radius: 12px; font-size: 12px; font-weight: 900; color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }

    /* ── Prestige ── */
    .pr {
        display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding: 20px 24px; border-radius: 22px;
        background: radial-gradient(60% 160% at 0% 50%, rgba(251,191,36,0.16), transparent 60%), rgba(20,16,8,0.7);
        border: 1px solid rgba(251,191,36,0.35);
    }
    .pr-stars { display: flex; gap: 2px; color: #fbbf24; }
    .pr-star :global(svg) { fill: currentColor; filter: drop-shadow(0 0 8px rgba(251,191,36,0.6)); }
    .pr-star-off { color: #475569; }
    .pr-star-off :global(svg) { fill: none; filter: none; }
    .pr-text { flex: 1; min-width: 240px; }
    .pr-eyebrow { font-size: 10px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #fbbf24; }
    .pr-title { font-size: 20px; font-weight: 900; color: #fef3c7; margin-top: 4px; }
    .pr-desc { font-size: 12px; color: #a8a29e; margin-top: 4px; max-width: 520px; }
    .pr-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 8px; padding: 13px 24px; border-radius: 14px; cursor: pointer; font-size: 14px; font-weight: 900; color: #1c1404; border: none; background: linear-gradient(135deg, #fde68a, #f59e0b); box-shadow: 0 8px 24px rgba(245,158,11,0.35); }
    .pr-btn:hover { transform: translateY(-1px); }
    .pr-locked { font-size: 12px; color: #78716c; font-weight: 700; }

    @media (max-width: 900px) {
        .row { grid-template-columns: 1fr; }
        .tree-hint { margin-left: 0; width: 100%; }
    }
    @media (max-width: 600px) {
        .skh { padding: 18px; gap: 16px; }
        .skh-ring { width: 90px; height: 90px; }
        .lv-n { font-size: 28px; }
        .skh-sp { width: 100%; flex-direction: row; justify-content: center; gap: 10px; min-width: 0; }
        .sp-n { font-size: 30px; }
        .sp-l, .sp-note { margin-top: 0; }
        .ladder { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid { grid-template-columns: 1fr; }
    }
</style>
