<script>
    import { switchTab } from '../../stores/ui.js';
    import { hasBoughtStarter, club, squad } from '../../stores/game.js';

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: step1Done = $hasBoughtStarter;
    $: step2Done = starters.length === 5;
    $: step3Done = step1Done && step2Done;

    const features = [
        { icon: '📦', title: 'Collect Cards', desc: 'Open packs to build your collection of pro player cards across every tier.' },
        { icon: '⚔️', title: 'Compete', desc: 'Enter tournaments, play season splits, and climb your way to the World Championship.' },
        { icon: '⭐', title: 'Progress', desc: 'Complete quests, upgrade cards, unlock skill trees, and earn prestige titles.' },
    ];
</script>

<section class="welcome">
    <!-- Hero -->
    <div class="hero">
        <div class="hero-glow"></div>
        <div class="hero-content">
            <div class="hero-badge">NEW MANAGER</div>
            <div class="hero-icon">🎮</div>
            <h1 class="hero-title">LoL Ultimate Roster</h1>
            <p class="hero-desc">Collect esports player cards, build your dream squad, and compete in tournaments — from the Gaming Cafe all the way to the World Championship.</p>
        </div>
        <div class="hero-particles">
            <span class="particle p1"></span>
            <span class="particle p2"></span>
            <span class="particle p3"></span>
        </div>
    </div>

    <!-- Steps -->
    <div class="steps-header">
        <span class="steps-label">Getting Started</span>
        <span class="steps-progress">{(step1Done ? 1 : 0) + (step2Done ? 1 : 0)}/3 complete</span>
    </div>

    <div class="steps-track">
        <div class="track-line">
            <div class="track-fill" style="width: {((step1Done ? 1 : 0) + (step2Done ? 1 : 0) + (step3Done ? 1 : 0)) / 3 * 100}%"></div>
        </div>
    </div>

    <div class="steps">
        <!-- Step 1 -->
        <div class="step" class:step-done={step1Done}>
            <div class="step-marker" class:marker-done={step1Done}>
                {#if step1Done}<span class="marker-check">✓</span>{:else}1{/if}
            </div>
            <div class="step-body">
                <div class="step-header">
                    <h3 class="step-title step-title-green">Claim Your Starter Pack</h3>
                    {#if step1Done}<span class="step-badge badge-green">Complete</span>{:else}<span class="step-badge badge-active">Start Here</span>{/if}
                </div>
                <p class="step-desc">Head to the Store and grab your free Starter Pack — 6 cards, one per role, to get you started.</p>
                {#if !step1Done}
                    <button class="step-btn btn-green" on:click={() => switchTab('store')}>
                        <span class="btn-icon">📦</span> Open Store
                        <span class="btn-arrow">→</span>
                    </button>
                {/if}
            </div>
        </div>

        <!-- Step 2 -->
        <div class="step" class:step-done={step2Done} class:step-locked={!step1Done}>
            <div class="step-marker" class:marker-done={step2Done}>
                {#if step2Done}<span class="marker-check">✓</span>{:else}2{/if}
            </div>
            <div class="step-body">
                <div class="step-header">
                    <h3 class="step-title step-title-blue">Build Your Squad</h3>
                    {#if step2Done}
                        <span class="step-badge badge-green">Complete</span>
                    {:else if step1Done}
                        <span class="step-badge badge-active">Next Up</span>
                    {/if}
                </div>
                <p class="step-desc">Assign players to TOP, JNG, MID, ADC, and SUP. You need all 5 positions filled to compete.</p>
                {#if step1Done && !step2Done}
                    <button class="step-btn btn-blue" on:click={() => switchTab('squad')}>
                        <span class="btn-icon">👥</span> Build Squad
                        <span class="btn-arrow">→</span>
                    </button>
                {/if}
                {#if !step1Done}
                    <div class="step-lock">Complete Step 1 first</div>
                {/if}
            </div>
        </div>

        <!-- Step 3 -->
        <div class="step" class:step-done={false} class:step-locked={!step2Done}>
            <div class="step-marker">3</div>
            <div class="step-body">
                <div class="step-header">
                    <h3 class="step-title step-title-amber">Enter a Tournament</h3>
                    {#if step2Done}
                        <span class="step-badge badge-active">Ready</span>
                    {/if}
                </div>
                <p class="step-desc">Hit PLAY and enter the Gaming Cafe Tournament — free entry, win Blue Essence to buy more packs.</p>
                {#if step2Done}
                    <button class="step-btn btn-amber" on:click={() => switchTab('tournament')}>
                        <span class="btn-icon">⚔️</span> Go Play
                        <span class="btn-arrow">→</span>
                    </button>
                {/if}
                {#if !step2Done}
                    <div class="step-lock">Complete Step 2 first</div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Features -->
    <div class="features-header">What Awaits You</div>
    <div class="features">
        {#each features as feat}
            <div class="feature">
                <div class="feature-icon">{feat.icon}</div>
                <h4 class="feature-title">{feat.title}</h4>
                <p class="feature-desc">{feat.desc}</p>
            </div>
        {/each}
    </div>

    <!-- CTA -->
    <div class="cta">
        {#if step1Done}
            <button class="cta-btn" on:click={() => switchTab('home')}>
                Go to Home Dashboard →
            </button>
        {:else}
            <p class="cta-hint">Your journey begins with a single pack. Claim it above to start!</p>
        {/if}
    </div>
</section>

<style>
    .welcome {
        max-width: 700px;
        margin: 0 auto;
        padding-bottom: 48px;
    }

    /* === HERO === */
    .hero {
        position: relative;
        background: linear-gradient(160deg, rgba(15, 23, 60, 0.8), rgba(10, 14, 30, 0.9));
        padding: 56px 32px 48px;
        border-radius: 24px;
        border: 1px solid rgba(79, 70, 229, 0.12);
        text-align: center;
        overflow: hidden;
        margin-bottom: 32px;
        box-shadow:
            0 0 60px rgba(79, 70, 229, 0.06),
            0 24px 48px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    .hero-glow {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse at 50% -20%, rgba(79, 70, 229, 0.12), transparent 60%),
            radial-gradient(ellipse at 30% 100%, rgba(59, 130, 246, 0.06), transparent 50%),
            radial-gradient(ellipse at 70% 100%, rgba(168, 85, 247, 0.04), transparent 50%);
        pointer-events: none;
    }
    .hero-content { position: relative; z-index: 1; }
    .hero-badge {
        display: inline-block;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 3px;
        color: #818cf8;
        background: rgba(99, 102, 241, 0.08);
        border: 1px solid rgba(99, 102, 241, 0.15);
        padding: 4px 16px;
        border-radius: 100px;
        margin-bottom: 20px;
    }
    .hero-icon {
        font-size: 52px;
        margin-bottom: 12px;
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
    }
    .hero-title {
        font-size: 28px;
        font-weight: 900;
        color: #93c5fd;
        text-transform: uppercase;
        letter-spacing: 4px;
        margin-bottom: 12px;
        text-shadow: 0 2px 20px rgba(59, 130, 246, 0.15);
    }
    .hero-desc {
        color: #64748b;
        font-size: 13px;
        line-height: 1.7;
        max-width: 480px;
        margin: 0 auto;
    }

    /* Hero particles */
    .hero-particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .particle {
        position: absolute;
        border-radius: 50%;
        opacity: 0.15;
        animation: float 8s ease-in-out infinite;
    }
    .p1 { width: 6px; height: 6px; background: #818cf8; top: 20%; left: 15%; animation-delay: 0s; }
    .p2 { width: 4px; height: 4px; background: #60a5fa; top: 60%; right: 20%; animation-delay: 2.5s; }
    .p3 { width: 5px; height: 5px; background: #a78bfa; bottom: 25%; left: 65%; animation-delay: 5s; }
    @keyframes float {
        0%, 100% { transform: translateY(0) scale(1); opacity: 0.15; }
        50% { transform: translateY(-20px) scale(1.3); opacity: 0.3; }
    }

    /* === STEPS === */
    .steps-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }
    .steps-label {
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #475569;
    }
    .steps-progress {
        font-size: 10px;
        font-weight: 700;
        color: #334155;
        font-family: monospace;
    }
    .steps-track {
        margin-bottom: 20px;
    }
    .track-line {
        width: 100%;
        height: 3px;
        background: #1e293b;
        border-radius: 4px;
        overflow: hidden;
    }
    .track-fill {
        height: 100%;
        background: linear-gradient(90deg, #059669, #10b981);
        border-radius: 4px;
        transition: width 0.6s ease;
    }

    .steps {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 36px;
    }

    .step {
        display: flex;
        gap: 16px;
        padding: 20px;
        border-radius: 16px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.2);
        transition: all 0.2s ease;
        align-items: flex-start;
    }
    .step:hover:not(.step-locked) {
        border-color: rgba(71, 85, 105, 0.3);
        background: rgba(15, 20, 35, 0.6);
    }
    .step-done {
        border-color: rgba(16, 185, 129, 0.1) !important;
        background: rgba(6, 78, 59, 0.06) !important;
    }
    .step-locked {
        opacity: 0.4;
    }

    /* Marker */
    .step-marker {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 900;
        flex-shrink: 0;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8));
        border: 2px solid rgba(51, 65, 85, 0.3);
        color: #475569;
        transition: all 0.3s ease;
    }
    .marker-done {
        background: linear-gradient(135deg, #059669, #10b981) !important;
        border-color: rgba(16, 185, 129, 0.4) !important;
        color: white !important;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    }
    .marker-check { font-size: 14px; }

    /* Body */
    .step-body { flex: 1; min-width: 0; }
    .step-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
    }
    .step-title {
        font-size: 15px;
        font-weight: 900;
    }
    .step-title-green { color: #34d399; }
    .step-title-blue { color: #60a5fa; }
    .step-title-amber { color: #fbbf24; }
    .step-done .step-title { color: #475569 !important; }

    .step-badge {
        font-size: 8px;
        font-weight: 900;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        padding: 2px 10px;
        border-radius: 100px;
        flex-shrink: 0;
    }
    .badge-green {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
        border: 1px solid rgba(16, 185, 129, 0.15);
    }
    .badge-active {
        background: rgba(59, 130, 246, 0.1);
        color: #60a5fa;
        border: 1px solid rgba(59, 130, 246, 0.15);
        animation: badgePulse 2s ease-in-out infinite;
    }
    @keyframes badgePulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    .step-desc {
        font-size: 12px;
        color: #475569;
        line-height: 1.6;
        margin-bottom: 12px;
    }
    .step-done .step-desc { color: #334155; }

    .step-lock {
        font-size: 10px;
        color: #1e293b;
        font-weight: 700;
        font-style: italic;
    }

    /* Step buttons */
    .step-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 22px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.5px;
        border: none;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }
    .step-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }
    .step-btn:active { transform: scale(0.97); }
    .btn-icon { font-size: 14px; }
    .btn-arrow {
        margin-left: 4px;
        opacity: 0.6;
        transition: transform 0.15s ease;
    }
    .step-btn:hover .btn-arrow { transform: translateX(3px); opacity: 1; }

    .btn-green {
        background: linear-gradient(135deg, #059669, #10b981);
        color: white;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.25);
    }
    .btn-green:hover { box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4); }
    .btn-blue {
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        color: white;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.25);
    }
    .btn-blue:hover { box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4); }
    .btn-amber {
        background: linear-gradient(135deg, #d97706, #f59e0b);
        color: #1c1917;
        box-shadow: 0 4px 15px rgba(245, 158, 11, 0.25);
    }
    .btn-amber:hover { box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4); }

    /* === FEATURES === */
    .features-header {
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #475569;
        margin-bottom: 14px;
    }
    .features {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 32px;
    }
    @media (max-width: 600px) {
        .features { grid-template-columns: 1fr; }
    }
    .feature {
        background: rgba(12, 16, 28, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.15);
        border-radius: 16px;
        padding: 24px 16px;
        text-align: center;
        transition: all 0.15s ease;
    }
    .feature:hover {
        border-color: rgba(71, 85, 105, 0.25);
        transform: translateY(-2px);
    }
    .feature-icon {
        font-size: 28px;
        margin-bottom: 10px;
    }
    .feature-title {
        font-size: 13px;
        font-weight: 900;
        color: #e2e8f0;
        margin-bottom: 6px;
    }
    .feature-desc {
        font-size: 10px;
        color: #475569;
        line-height: 1.6;
    }

    /* === CTA === */
    .cta {
        text-align: center;
        padding: 24px;
        background: rgba(12, 16, 28, 0.3);
        border: 1px solid rgba(51, 65, 85, 0.1);
        border-radius: 16px;
    }
    .cta-btn {
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        color: white;
        font-weight: 900;
        font-size: 13px;
        padding: 12px 32px;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
        transition: all 0.15s ease;
    }
    .cta-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 24px rgba(59, 130, 246, 0.45);
    }
    .cta-hint {
        font-size: 12px;
        color: #334155;
        font-style: italic;
    }

    /* === RESPONSIVE === */
    @media (max-width: 600px) {
        .hero { padding: 36px 20px 32px; }
        .hero-title { font-size: 20px; letter-spacing: 2px; }
        .hero-desc { font-size: 12px; }
        .step { padding: 16px; gap: 12px; }
        .step-marker { width: 34px; height: 34px; font-size: 14px; }
    }
</style>
