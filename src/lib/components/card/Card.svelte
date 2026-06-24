<script>
    import { isDarkCard, isMidCard } from '../../utils/cards.js';
    import { inspectingCard } from '../../stores/ui.js';

    export let card;
    export let mini = false;
    export let onclick = null;
    export let showOwned = false;
    export let owned = true;

    const roleIconMap = {
        TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png',
        ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png'
    };
    const regionFlags = { LCK: '🇰🇷', LPL: '🇨🇳', LEC: '🇪🇺', LCS: '🇺🇸', LCP: '🌏', Legacy: '🏆' };

    $: dark = isDarkCard(card.quality, card.role);
    $: mid = isMidCard(card.quality);
    $: initials = card.name.slice(0, 2).toUpperCase();
    $: tierLabel = card.signature ? '✦ SIGNATURE ✦' : card.role === 'COACH' ? 'COACH STAFF' : card.quality.toUpperCase();
    $: tierClass = `tier-${card.quality.toLowerCase().replace(/ /g, '')}`;
    $: textColor = dark ? 'light' : 'dark';
    $: flag = regionFlags[card.region] || '';
    $: roleIcon = roleIconMap[card.role] || null;
    $: isSig = card.signature;

    function inspect(e) {
        e.stopPropagation();
        inspectingCard.set(card);
    }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
    class="card {tierClass}"
    class:card-mini={mini}
    class:card-signature={card.signature}
    class:card-holographic={card.holographic}
    class:card-unowned={showOwned && !owned}
    class:clickable={onclick}
    data-quality={card.quality}
    data-text={textColor}
    on:click={onclick}
    on:dblclick={inspect}
>
    <!-- Tier Header -->
    <div class="card-header" class:sig-header={isSig}>
        {tierLabel}
    </div>

    <div class="card-body">
        <!-- Role + Region Row -->
        <div class="card-meta">
            <span class="card-role">
                {#if roleIcon}
                    <img src={roleIcon} alt={card.role} class="role-icon">
                {/if}
                {card.role}
            </span>
            <span class="card-region">{flag} {card.region}</span>
        </div>

        <!-- Rating + Avatar -->
        <div class="card-identity">
            <span class="card-rating">{card.rating}</span>
            <div class="card-avatar">
                {#if roleIcon}
                    <img src={roleIcon} alt="" class="avatar-role-bg">
                {/if}
                <span class="avatar-initials">{initials}</span>
            </div>
        </div>

        <!-- Name + Team -->
        <div class="card-name" class:sig-name={isSig}>{card.name}</div>
        <div class="card-team">{card.team} [{card.year}]</div>

        <!-- Stats Grid -->
        <div class="card-stats">
            {#each [['MEC', card.stats.mec], ['TMF', card.stats.tmf], ['FRM', card.stats.frm], ['CMP', card.stats.cmp], ['MAP', card.stats.map], ['LDR', card.stats.ldr]] as [label, val]}
                <div class="card-stat">
                    <span class="stat-label">{label}</span>
                    <span class="stat-value">{val}</span>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .card {
        width: 220px;
        border-radius: 16px;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        cursor: default;
        user-select: none;
        font-family: 'Quicksand', sans-serif;
    }
    .card:not(.card-mini):hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    }
    .card-mini { width: 170px; font-size: 13px; }
    .card-mini .card-header { font-size: 8px; padding: 5px 8px; }
    .card-mini .card-body { padding: 8px 10px 10px; }
    .card-mini .card-rating { font-size: 1.8rem; }
    .card-mini .card-avatar { width: 40px; height: 40px; }
    .card-mini .card-name { font-size: 12px; margin-top: 5px; }
    .card-mini .card-team { font-size: 9px; }
    .card-mini .card-stats { font-size: 10px; padding-top: 5px; gap: 1px 8px; }
    .card-mini .stat-label { font-size: 8px; }
    .card-mini .role-icon { width: 10px; height: 10px; }
    .card-mini .card-meta { font-size: 8px; }
    .clickable { cursor: pointer; }
    .card-unowned { filter: grayscale(1) brightness(0.5); opacity: 0.6; }

    /* Signature font overrides */
    .card-signature { font-family: 'Tangerine', cursive; }
    .sig-header { font-family: 'Tangerine', cursive; font-size: 18px; letter-spacing: 3px; padding: 10px 12px; }
    .sig-name { font-family: 'Tangerine', cursive; font-size: 28px; line-height: 1.1; }
    .card-signature .card-meta,
    .card-signature .card-stats,
    .card-signature .card-team,
    .card-signature .card-rating { font-family: 'Quicksand', sans-serif; }

    /* Header */
    .card-header {
        text-align: center;
        padding: 8px 12px;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 2px;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        background: rgba(0,0,0,0.25);
    }

    /* Body */
    .card-body {
        padding: 14px 16px 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }
    .card-mini .card-body { padding: 10px 12px 12px; }

    /* Meta row */
    .card-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
    }
    .card-role {
        background: rgba(0,0,0,0.2);
        padding: 3px 8px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .role-icon { width: 14px; height: 14px; display: inline-block; vertical-align: middle; flex-shrink: 0; }
    .card-mini .role-icon { width: 12px; height: 12px; }
    .card-region { opacity: 0.7; letter-spacing: 0.5px; font-size: 9px; }

    /* Identity */
    .card-identity {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        margin-top: 10px;
    }
    .card-rating {
        font-size: 2.8rem;
        font-weight: 900;
        letter-spacing: -2px;
        text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        line-height: 1;
    }
    .card-mini .card-rating { font-size: 2rem; }
    .card-avatar {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.2);
        background: rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        position: relative;
        overflow: hidden;
    }
    .card-mini .card-avatar { width: 46px; height: 46px; }
    .avatar-role-bg {
        position: absolute;
        width: 36px; height: 36px;
        opacity: 0.08;
    }
    .card-mini .avatar-role-bg { width: 28px; height: 28px; }
    .avatar-initials {
        position: relative;
        font-weight: 900;
        font-size: 16px;
        z-index: 1;
    }
    .card-mini .avatar-initials { font-size: 13px; }

    /* Name + Team */
    .card-name {
        font-weight: 900;
        font-size: 15px;
        text-align: center;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 8px;
        text-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }
    .card-mini .card-name { font-size: 13px; margin-top: 6px; }
    .card-team {
        font-size: 11px;
        font-weight: 700;
        text-align: center;
        opacity: 0.55;
        margin-bottom: 6px;
    }
    .card-mini .card-team { font-size: 9px; }

    /* Stats */
    .card-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2px 12px;
        width: 100%;
        border-top: 1px solid rgba(255,255,255,0.1);
        padding-top: 8px;
        font-size: 12px;
        font-weight: 800;
    }
    .card-mini .card-stats { gap: 1px 8px; font-size: 10px; padding-top: 6px; }
    .card-stat { display: flex; gap: 4px; align-items: baseline; }
    .stat-label { opacity: 0.45; font-size: 9px; min-width: 26px; }
    .card-mini .stat-label { font-size: 8px; min-width: 22px; }

    /* Text colors */
    [data-text="light"] .card-header, [data-text="light"] .card-role, [data-text="light"] .card-rating,
    [data-text="light"] .avatar-initials, [data-text="light"] .card-name, [data-text="light"] .stat-value { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
    [data-text="light"] .card-region, [data-text="light"] .card-team { color: rgba(255,255,255,0.6); }
    [data-text="light"] .stat-label { color: rgba(255,255,255,0.45); }
    [data-text="light"] .card-stats { border-color: rgba(255,255,255,0.12); }

    [data-text="dark"] .card-header, [data-text="dark"] .card-role, [data-text="dark"] .card-rating,
    [data-text="dark"] .avatar-initials, [data-text="dark"] .card-name, [data-text="dark"] .stat-value { color: #0f172a; text-shadow: none; }
    [data-text="dark"] .card-region, [data-text="dark"] .card-team { color: rgba(15,23,42,0.6); }
    [data-text="dark"] .stat-label { color: rgba(15,23,42,0.45); }
    [data-text="dark"] .card-stats { border-color: rgba(0,0,0,0.12); }

    /* === TIER BACKGROUNDS === */
    .tier-bronze { background: linear-gradient(145deg, #92643a 0%, #6b4423 40%, #4a2f15 100%); border: 3px solid #8b6239; }
    .tier-silver { background: linear-gradient(145deg, #e2e8f0 0%, #94a3b8 40%, #64748b 100%); border: 3px solid #94a3b8; }
    .tier-gold { background: linear-gradient(145deg, #fef08a 0%, #eab308 40%, #a16207 100%); border: 3px solid #ca8a04; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 12px rgba(234,179,8,0.15); }
    .tier-platinum { background: linear-gradient(145deg, #a7f3d0 0%, #10b981 40%, #047857 100%); border: 3px solid #059669; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 12px rgba(16,185,129,0.2); }
    .tier-diamond { background: linear-gradient(145deg, #bfdbfe 0%, #3b82f6 35%, #1e40af 100%); border: 3px solid #60a5fa; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 18px rgba(59,130,246,0.35); }
    .tier-master { background: linear-gradient(145deg, #e9d5ff 0%, #a855f7 40%, #7e22ce 100%); border: 3px solid #9333ea; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 18px rgba(168,85,247,0.3); }
    .tier-grandmaster { background: linear-gradient(145deg, #fecaca 0%, #ef4444 40%, #991b1b 100%); border: 3px solid #dc2626; box-shadow: 0 0 18px rgba(239,68,68,0.5); animation: gm-pulse 2.5s ease-in-out infinite; }
    @keyframes gm-pulse { 0%,100% { box-shadow: 0 0 18px rgba(239,68,68,0.5); } 50% { box-shadow: 0 0 28px rgba(239,68,68,0.8), 0 0 60px rgba(239,68,68,0.3); } }

    .tier-challenger { background: linear-gradient(45deg, #f59e0b, #fbbf24, #7c3aed, #3b82f6, #a855f7, #f59e0b); background-size: 300% 300%; border: none; padding: 3px; animation: chall-flow 3s ease infinite; box-shadow: 0 0 20px rgba(245,158,11,0.5); position: relative; overflow: hidden !important; }
    .tier-challenger .card-header, .tier-challenger .card-body { background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c0a1e 100%); }
    .tier-challenger .card-header { border-radius: 13px 13px 0 0; }
    .tier-challenger .card-body { border-radius: 0 0 13px 13px; }
    @keyframes chall-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    /* Legacy / Award tiers */
    .tier-champion { background: linear-gradient(145deg, #1c1917 0%, #292524 40%, #0c0a09 100%); border: 3px solid #d97706; box-shadow: 0 0 22px rgba(217,119,6,0.5); animation: champ-shimmer 4s ease-in-out infinite; }
    @keyframes champ-shimmer { 0%,100% { box-shadow: 0 0 22px rgba(217,119,6,0.5); } 50% { box-shadow: 0 0 36px rgba(217,119,6,0.8); } }
    .tier-mvp { background: linear-gradient(145deg, #4a0426 0%, #2d1055 40%, #be185d 100%); border: 3px solid #ec4899; box-shadow: 0 0 20px rgba(236,72,153,0.5); animation: mvp-pulse 2.8s ease-in-out infinite; }
    @keyframes mvp-pulse { 0%,100% { box-shadow: 0 0 20px rgba(236,72,153,0.5); } 50% { box-shadow: 0 0 34px rgba(236,72,153,0.8); } }
    .tier-finalist { background: linear-gradient(145deg, #0f172a 0%, #334155 40%, #1e293b 100%); border: 3px solid #94a3b8; box-shadow: 0 0 18px rgba(148,163,184,0.4); }
    .tier-msi { background: linear-gradient(145deg, #042f2e 0%, #0f766e 40%, #134e4a 100%); border: 3px solid #2dd4bf; box-shadow: 0 0 18px rgba(45,212,191,0.4); }
    .tier-firststand { background: linear-gradient(145deg, #431407 0%, #c2410c 40%, #7c2d12 100%); border: 3px solid #fb923c; box-shadow: 0 0 16px rgba(251,146,60,0.4); }

    /* New award tiers */
    .tier-poty { background: linear-gradient(145deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%); border: 3px solid #e94560; box-shadow: 0 0 20px rgba(233,69,96,0.4); animation: poty-glow 3s ease-in-out infinite; }
    @keyframes poty-glow { 0%,100% { box-shadow: 0 0 20px rgba(233,69,96,0.4); } 50% { box-shadow: 0 0 32px rgba(233,69,96,0.7); } }
    .tier-roty { background: linear-gradient(145deg, #0d1b2a 0%, #1b263b 40%, #415a77 100%); border: 3px solid #00b4d8; box-shadow: 0 0 18px rgba(0,180,216,0.4); }
    .tier-toty { background: linear-gradient(145deg, #14213d 0%, #fca311 30%, #e5e5e5 100%); border: 3px solid #fca311; box-shadow: 0 0 22px rgba(252,163,17,0.5); animation: toty-glow 3s ease-in-out infinite; }
    @keyframes toty-glow { 0%,100% { box-shadow: 0 0 22px rgba(252,163,17,0.5); } 50% { box-shadow: 0 0 35px rgba(252,163,17,0.8); } }
    .tier-gpoty { background: linear-gradient(145deg, #0b0c10 0%, #1a1a2e 30%, #533483 100%); border: 3px solid #e0aaff; box-shadow: 0 0 24px rgba(224,170,255,0.4), 0 0 50px rgba(224,170,255,0.15); animation: gpoty-glow 2.5s ease-in-out infinite; }
    @keyframes gpoty-glow { 0%,100% { box-shadow: 0 0 24px rgba(224,170,255,0.4); } 50% { box-shadow: 0 0 38px rgba(224,170,255,0.7), 0 0 70px rgba(224,170,255,0.2); } }
    .tier-x { background: linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 40%, #2d2d2d 100%); border: 3px solid #ff6b6b; box-shadow: 0 0 18px rgba(255,107,107,0.3); animation: x-pulse 2s linear infinite; }
    @keyframes x-pulse { 0%,100% { border-color: #ff6b6b; } 50% { border-color: #ffd93d; } }

    /* Coach */
    .tier-coach { background: linear-gradient(145deg, #022c22 0%, #064e3b 100%); border: 3px dashed #10b981; }

    /* Effects */
    .card-signature { outline: 2px solid rgba(255,215,0,0.5); outline-offset: 2px; animation: sig-glow 2s ease-in-out infinite; }
    .card-signature::after { content: ''; position: absolute; top: 0; left: -100%; width: 60%; height: 100%; background: linear-gradient(105deg, transparent 20%, rgba(255,215,0,0.1) 40%, rgba(255,215,0,0.2) 50%, rgba(255,215,0,0.1) 60%, transparent 80%); animation: sig-sweep 3s ease-in-out infinite; pointer-events: none; border-radius: inherit; z-index: 5; }
    @keyframes sig-glow { 0%,100% { outline-color: rgba(255,215,0,0.5); } 50% { outline-color: rgba(255,215,0,0.8); } }
    @keyframes sig-sweep { 0%,100% { left: -100%; } 50% { left: 140%; } }
    .card-holographic { outline: 3px solid transparent; outline-offset: 2px; animation: holo-outline 2s linear infinite; }
    @keyframes holo-outline { 0% { outline-color: #ff0000; filter: drop-shadow(0 0 6px #ff0000); } 16% { outline-color: #ff7700; } 33% { outline-color: #ffff00; } 50% { outline-color: #00ff00; } 66% { outline-color: #0077ff; } 83% { outline-color: #8b00ff; } 100% { outline-color: #ff0000; filter: drop-shadow(0 0 6px #ff0000); } }
</style>
