<script>
    import Icon from '../ui/Icon.svelte';
    import { switchTab } from '../../stores/ui.js';
    import { hasBoughtStarter, squad, trackStats, seasonData, dailyLogin, teamIdentity } from '../../stores/game.js';

    // The first-run checklist. Every step is read from real save data, so it ticks itself off
    // whichever order the player does things in, and "Next" always points at the first step
    // still open. (The old page had a third step that could never complete.)
    $: starters = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => $squad[r]).filter(Boolean).length;
    $: steps = [
        { id: 'starter', icon: 'store', c: '#34d399', tab: 'store', cta: 'Open the Store',
          title: 'Claim your Starter Pack', desc: 'Free: six cards, one for every role and a coach. It is waiting in the Store.',
          done: !!$hasBoughtStarter },
        { id: 'squad', icon: 'squad', c: '#60a5fa', tab: 'squad', cta: 'Build your squad',
          title: 'Fill your starting five', desc: `Put a player in TOP, JNG, MID, ADC and SUP — ${starters}/5 done. Auto fill does it in one click.`,
          done: starters === 5 },
        { id: 'cafe', icon: 'coffee', c: '#fbbf24', tab: 'tournament', cta: 'Play the Gaming Cafe',
          title: 'Win the Gaming Cafe', desc: 'Free to enter and always open. Three rounds against easier sides for your first Blue Essence.',
          done: ($trackStats.cafeWins || 0) > 0 },
        { id: 'season', icon: 'calendar', c: '#818cf8', tab: 'season', cta: 'Start a split',
          title: 'Start a Season split', desc: 'A 10-team league, then the Regional Trophy. Reaching the final is how you qualify for First Stand, MSI and Worlds.',
          done: $seasonData.stage !== 'idle' || ($seasonData.currentSplit || 1) > 1 || ($trackStats.splitsCompleted || 0) > 0 },
        { id: 'daily', icon: 'gift', c: '#f472b6', tab: 'rewards', cta: 'Claim today\'s reward',
          title: 'Claim a daily reward', desc: 'Log in each day for Blue Essence, cards and Skill Points. Streaks pay extra.',
          done: ($dailyLogin.totalDays || 0) > 0 },
    ];
    $: doneCount = steps.filter(s => s.done).length;
    $: next = steps.find(s => !s.done) || null;
    $: pct = doneCount / steps.length;

    const loop = [
        { icon: 'store', c: '#fbbf24', title: 'Collect', desc: 'Open packs and chase rare tiers, Signatures and Legacy cards.', tab: 'store' },
        { icon: 'squad', c: '#60a5fa', title: 'Build', desc: 'One region, one era and same-team pairs add chemistry to your Power.', tab: 'squad' },
        { icon: 'trophy', c: '#34d399', title: 'Compete', desc: 'Gaming Cafe any time; the Season decides who goes international.', tab: 'tournament' },
        { icon: 'skills', c: '#c084fc', title: 'Grow', desc: 'Level up, unlock skills, upgrade duplicates and complete the Archive.', tab: 'skills' },
    ];
    const year = [
        { split: 'Winter', event: 'First Stand', rule: 'Champion only', c: '#38bdf8' },
        { split: 'Spring', event: 'MSI', rule: 'Both finalists', c: '#2dd4bf' },
        { split: 'Summer', event: 'Worlds', rule: 'Both finalists', c: '#fbbf24' },
    ];
</script>

<section class="wl">
    <!-- ── Hero ── -->
    <header class="hero" style="--tc: {$teamIdentity.color || '#3b82f6'};">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="ring">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="52" /><circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {pct * 326.7} 326.7;" /></svg>
            <span class="ring-logo">{$teamIdentity.logo || '🛡️'}</span>
            <span class="ring-n">{doneCount}/{steps.length}</span>
        </div>
        <div class="hero-text">
            <span class="eyebrow"><Icon name="welcome" size={13} stroke={2.2} /> Welcome, manager</span>
            <h2 class="title">{$teamIdentity.name || 'Your club'} starts here</h2>
            <p class="sub">Collect pro player cards, build your five and take them from the Gaming Cafe to the World Championship. Five quick steps get you going.</p>
            {#if next}
                <button class="cta" style="--c: {next.c};" on:click={() => switchTab(next.tab)}>
                    <Icon name={next.icon} size={16} stroke={2.2} />
                    <span>Next: {next.title}</span>
                    <Icon name="arrow" size={15} stroke={2.4} />
                </button>
            {:else}
                <button class="cta cta-done" on:click={() => switchTab('home')}>
                    <Icon name="check" size={16} stroke={2.6} />
                    <span>You're all set — go to your dashboard</span>
                    <Icon name="arrow" size={15} stroke={2.4} />
                </button>
            {/if}
        </div>
    </header>

    <!-- ── Checklist ── -->
    <div class="steps">
        {#each steps as s, i (s.id)}
            {@const isNext = next && next.id === s.id}
            <div class="step" class:step-done={s.done} class:step-next={isNext} style="--c: {s.c};">
                <span class="step-n">
                    {#if s.done}<Icon name="check" size={16} stroke={2.8} />{:else}{i + 1}{/if}
                </span>
                <span class="step-ico"><Icon name={s.icon} size={18} /></span>
                <div class="step-text">
                    <span class="step-title">{s.title}{#if isNext}<span class="tag">Next</span>{/if}</span>
                    <span class="step-desc">{s.done ? 'Done.' : s.desc}</span>
                </div>
                {#if !s.done}
                    <button class="step-go" class:step-go-main={isNext} on:click={() => switchTab(s.tab)}>{s.cta}</button>
                {/if}
            </div>
        {/each}
    </div>

    <!-- ── How it works ── -->
    <section class="block">
        <h3 class="bh">How the game works</h3>
        <div class="loop">
            {#each loop as l, i (l.title)}
                <button class="lp" style="--c: {l.c};" on:click={() => switchTab(l.tab)}>
                    <span class="lp-ico"><Icon name={l.icon} size={20} /></span>
                    <span class="lp-title">{l.title}</span>
                    <span class="lp-desc">{l.desc}</span>
                    {#if i < loop.length - 1}<span class="lp-arrow" aria-hidden="true"><Icon name="chevron" size={14} stroke={2.4} /></span>{/if}
                </button>
            {/each}
        </div>
    </section>

    <!-- ── The year ── -->
    <section class="block">
        <h3 class="bh">The competitive year</h3>
        <div class="year">
            {#each year as y (y.split)}
                <div class="yr" style="--c: {y.c};">
                    <span class="yr-split">{y.split} split</span>
                    <Icon name="arrow" size={14} stroke={2.4} />
                    <span class="yr-event">{y.event}</span>
                    <span class="yr-rule">{y.rule} of the Regional Trophy qualify</span>
                </div>
            {/each}
        </div>
        <p class="year-note"><Icon name="crown" size={13} stroke={2.2} /> Win all six titles of one year in order and you complete the <b>Golden Road</b> — worth 25,000 BE.</p>
    </section>

    <!-- ── Help ── -->
    <div class="help">
        <span class="help-text">Want the details? The Guide explains every system, and you can change theme, sound and more in Settings.</span>
        <div class="help-btns">
            <button class="help-btn" on:click={() => switchTab('guide')}><Icon name="guide" size={14} /> Open the Guide</button>
            <button class="help-btn" on:click={() => switchTab('home')}><Icon name="home" size={14} /> Home dashboard</button>
        </div>
    </div>
</section>

<style>
    .wl { display: flex; flex-direction: column; gap: 18px; max-width: 980px; margin: 0 auto; padding-bottom: 40px; }

    /* ── Hero ── */
    .hero {
        position: relative; overflow: hidden; display: flex; gap: 26px; align-items: center; flex-wrap: wrap;
        padding: 26px 28px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, color-mix(in srgb, var(--tc) 20%, transparent), transparent 65%), linear-gradient(120deg, #0b1224, #0b0e1a 60%);
        border: 1px solid color-mix(in srgb, var(--tc) 35%, rgba(148,163,184,0.15));
    }
    .hero-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(168,85,247,0.12), transparent 65%); }
    .ring { position: relative; width: 120px; height: 120px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 9; }
    .ring-fg { fill: none; stroke: #34d399; stroke-width: 9; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(52,211,153,0.55)); transition: stroke-dasharray 0.6s ease; }
    .ring-logo { position: relative; font-size: 34px; line-height: 1; }
    .ring-n { position: relative; margin-top: 4px; font-size: 12px; font-weight: 900; color: #a7f3d0; }
    .hero-text { position: relative; flex: 1; min-width: 260px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #93c5fd; }
    .title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .sub { font-size: 13.5px; color: #94a3b8; margin-top: 6px; max-width: 580px; line-height: 1.55; }
    .cta { display: inline-flex; align-items: center; gap: 10px; margin-top: 16px; padding: 12px 20px; border-radius: 14px; border: none; cursor: pointer; font-size: 14px; font-weight: 900; color: #0b1220; background: var(--c); box-shadow: 0 8px 24px color-mix(in srgb, var(--c) 35%, transparent); transition: transform 0.12s, filter 0.12s; }
    .cta:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .cta-done { --c: #34d399; }

    /* ── Steps ── */
    .steps { display: flex; flex-direction: column; gap: 8px; }
    .step {
        display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px;
        background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); transition: border-color 0.15s;
    }
    .step-next { border-color: color-mix(in srgb, var(--c) 60%, transparent); background: linear-gradient(90deg, color-mix(in srgb, var(--c) 12%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 60%); box-shadow: 0 8px 24px color-mix(in srgb, var(--c) 10%, transparent); }
    .step-done { opacity: 0.62; }
    .step-n { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; color: #94a3b8; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.4); }
    .step-done .step-n { color: #052e16; background: #34d399; border-color: #34d399; }
    .step-next .step-n { color: #fff; border-color: var(--c); }
    .step-ico { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .step-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .step-title { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 900; color: #e2e8f0; }
    .tag { font-size: 9.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 2px 8px; border-radius: 100px; color: #0b1220; background: var(--c); }
    .step-desc { font-size: 12.5px; color: #8b9ab0; line-height: 1.5; }
    .step-go { flex-shrink: 0; padding: 9px 14px; border-radius: 12px; cursor: pointer; font-size: 12.5px; font-weight: 800; color: #cbd5e1; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.4); white-space: nowrap; }
    .step-go:hover { color: #fff; border-color: color-mix(in srgb, var(--c) 55%, transparent); }
    .step-go-main { color: #0b1220; background: var(--c); border-color: var(--c); font-weight: 900; }
    .step-go-main:hover { color: #0b1220; filter: brightness(1.08); }

    /* ── Blocks ── */
    .block { display: flex; flex-direction: column; gap: 10px; }
    .bh { font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
    .loop { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .lp { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 16px; cursor: pointer; text-align: left; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); transition: transform 0.15s, border-color 0.15s; }
    .lp:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 50%, transparent); }
    .lp-ico { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .lp-title { font-size: 15px; font-weight: 900; color: #fff; }
    .lp-desc { font-size: 12px; color: #8b9ab0; line-height: 1.5; }
    .lp-arrow { position: absolute; right: -13px; top: 50%; transform: translateY(-50%); z-index: 1; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #64748b; background: #0b0e1a; border: 1px solid rgba(71,85,105,0.4); }

    .year { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .yr { display: grid; grid-template-columns: auto auto 1fr; align-items: center; column-gap: 8px; row-gap: 4px; padding: 14px 16px; border-radius: 16px; background: linear-gradient(140deg, color-mix(in srgb, var(--c) 12%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 60%); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); color: #64748b; }
    .yr-split { font-size: 13px; font-weight: 900; color: #cbd5e1; }
    .yr-event { font-size: 14px; font-weight: 900; color: var(--c); }
    .yr-rule { grid-column: 1 / -1; font-size: 11.5px; color: #8b9ab0; }
    .year-note { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #94a3b8; }
    .year-note :global(.ico) { color: #eab308; }
    .year-note b { color: #fde68a; }

    .help { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 16px 18px; border-radius: 18px; background: rgba(12,16,28,0.5); border: 1px solid rgba(71,85,105,0.25); }
    .help-text { flex: 1; min-width: 240px; font-size: 12.5px; color: #8b9ab0; }
    .help-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .help-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 12px; cursor: pointer; font-size: 12.5px; font-weight: 800; color: #cbd5e1; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.4); }
    .help-btn:hover { color: #fff; border-color: rgba(96,165,250,0.5); }

    @media (max-width: 860px) {
        .loop { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lp-arrow { display: none; }
        .year { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
        .hero { padding: 20px; }
        .ring { width: 96px; height: 96px; }
        .ring-logo { font-size: 26px; }
        .step { flex-wrap: wrap; }
        .step-go { width: 100%; }
        .loop { grid-template-columns: 1fr; }
    }
</style>
