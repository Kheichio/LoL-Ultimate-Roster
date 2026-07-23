<script>
    import { isDarkCard, isMidCard, getEffectiveStats, getEffectiveRating } from '../../utils/cards.js';
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
    $: eStats = getEffectiveStats(card);
    $: eRating = getEffectiveRating(card);

    function inspect(e) {
        if (onclick) return;
        e.stopPropagation();
        inspectingCard.set(card);
    }
</script>

<div
    class="card {tierClass}"
    class:card-mini={mini}
    class:card-signature={card.signature}
    class:card-holographic={card.holographic}
    class:card-unowned={showOwned && !owned}
    class:clickable={onclick}
    data-quality={card.quality}
    data-text={textColor}
    role="button"
    tabindex="0"
    aria-label="{card.name}, {card.role}, {card.quality} rating {eRating}"
    on:click={onclick || inspect}
    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (onclick || inspect)(e); } }}
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
            <span class="card-rating">{eRating}</span>
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
            {#each [['MEC', eStats.mec], ['TMF', eStats.tmf], ['FRM', eStats.frm], ['CMP', eStats.cmp], ['MAP', eStats.map], ['LDR', eStats.ldr]] as [label, val]}
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
        width: 250px;
        border-radius: 16px;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        cursor: pointer;
        user-select: none;
        font-family: 'Quicksand', sans-serif;
    }
    .card:not(.card-mini):hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    }
    .card-mini { width: 180px; font-size: 13px; }
    .card-mini .card-header { font-size: 9px; padding: 7px 10px; }
    .card-mini .card-body { padding: 10px 14px 14px; }
    .card-mini .card-identity { margin-top: 8px; }
    .card-mini .card-rating { font-size: 2.4rem; }
    .card-mini .card-avatar { width: 46px; height: 46px; }
    .card-mini .avatar-initials { font-size: 14px; }
    .card-mini .card-name { font-size: 14px; margin-top: 6px; }
    .card-mini .card-team { font-size: 10px; }
    .card-mini .card-stats { font-size: 12px; padding-top: 8px; gap: 4px 14px; }
    .card-mini .stat-label { font-size: 9px; }
    .card-mini .role-icon { width: 12px; height: 12px; }
    .card-mini .card-meta { font-size: 10px; }
    .clickable { cursor: pointer; }
    .card:focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
    .card-unowned { filter: grayscale(1) brightness(0.5); opacity: 0.6; }

    /* Signature font overrides */
    .card-signature { font-family: 'Marck Script', cursive; }
    .sig-header { font-family: 'Marck Script', cursive; font-size: 16px; letter-spacing: 2px; padding: 10px 12px; }
    .sig-name { font-family: 'Marck Script', cursive; font-size: 24px; line-height: 1.2; }
    .card-signature .card-meta,
    .card-signature .card-stats,
    .card-signature .card-team,
    .card-signature .card-rating { font-family: 'Quicksand', sans-serif; }

    /* Header */
    .card-header {
        text-align: center;
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        background: rgba(0,0,0,0.25);
    }

    /* Body */
    .card-body {
        flex: 1;
        padding: 18px 20px 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }
    .card-mini .card-body { padding: 10px 14px 14px; }

    /* Meta row */
    .card-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
    }
    .card-role {
        background: rgba(0,0,0,0.2);
        padding: 4px 10px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    .role-icon { width: 16px; height: 16px; display: inline-block; vertical-align: middle; flex-shrink: 0; }
    .card-mini .role-icon { width: 12px; height: 12px; }
    .card-region { letter-spacing: 0.5px; font-size: 10px; }

    /* Identity */
    .card-identity {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        margin-top: 16px;
        margin-bottom: 4px;
    }
    .card-rating {
        font-size: 4.2rem;
        font-weight: 900;
        letter-spacing: -3px;
        text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        line-height: 1;
    }
    .card-mini .card-rating { font-size: 2.4rem; }
    .card-avatar {
        width: 72px;
        height: 72px;
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
        width: 44px; height: 44px;
        opacity: 0.08;
    }
    .card-mini .avatar-role-bg { width: 30px; height: 30px; }
    .avatar-initials {
        position: relative;
        font-weight: 900;
        font-size: 22px;
        z-index: 1;
    }
    .card-mini .avatar-initials { font-size: 14px; }

    /* Name + Team */
    .card-name {
        font-weight: 900;
        font-size: 20px;
        text-align: center;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 10px;
    }
    .card-mini .card-name { font-size: 14px; margin-top: 6px; }
    .card-team {
        font-size: 13px;
        font-weight: 700;
        text-align: center;
        margin-bottom: 6px;
    }
    .card-mini .card-team { font-size: 10px; }

    /* Stats */
    .card-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 28px;
        width: 100%;
        border-top: 1px solid rgba(255,255,255,0.1);
        padding-top: 14px;
        font-size: 18px;
        font-weight: 800;
    }
    .card-mini .card-stats { gap: 5px 16px; font-size: 14px; padding-top: 10px; }
    .card-stat { display: flex; gap: 6px; align-items: baseline; }
    .stat-label { font-size: 13px; min-width: 36px; }
    .card-mini .stat-label { font-size: 10px; min-width: 26px; }

    /* Text colors */
    [data-text="light"] .card-header, [data-text="light"] .card-role, [data-text="light"] .card-rating,
    [data-text="light"] .avatar-initials, [data-text="light"] .card-name, [data-text="light"] .stat-value { color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
    [data-text="light"] .card-region, [data-text="light"] .card-team { color: rgba(255,255,255,0.7); text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
    [data-text="light"] .stat-label { color: rgba(255,255,255,0.55); }
    [data-text="light"] .card-stats { border-color: rgba(255,255,255,0.12); }

    [data-text="dark"] .card-header, [data-text="dark"] .card-role, [data-text="dark"] .card-rating,
    [data-text="dark"] .avatar-initials, [data-text="dark"] .card-name, [data-text="dark"] .stat-value { color: #1e1e2e; text-shadow: 0 1px 0 rgba(255,255,255,0.2); }
    [data-text="dark"] .card-region, [data-text="dark"] .card-team { color: rgba(15,23,42,0.7); }
    [data-text="dark"] .stat-label { color: rgba(15,23,42,0.55); }
    [data-text="dark"] .card-stats { border-color: rgba(0,0,0,0.15); }

    /* === TIER BACKGROUNDS === */
    .tier-bronze { background: linear-gradient(145deg, #c39468 0%, #a97c55 45%, #8a6440 100%); border: 3px solid #b08862; }
    .tier-silver { background: linear-gradient(145deg, #e2e8f0 0%, #94a3b8 40%, #64748b 100%); border: 3px solid #94a3b8; }
    .tier-gold { background: linear-gradient(145deg, #fef08a 0%, #eab308 40%, #a16207 100%); border: 3px solid #ca8a04; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 12px rgba(234,179,8,0.15); }
    .tier-platinum { background: linear-gradient(145deg, #a7f3d0 0%, #10b981 40%, #047857 100%); border: 3px solid #059669; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 12px rgba(16,185,129,0.2); }
    .tier-diamond { background: linear-gradient(145deg, #bfdbfe 0%, #3b82f6 40%, #2563eb 100%); border: 3px solid #60a5fa; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 18px rgba(59,130,246,0.35); }
    .tier-master { background: linear-gradient(145deg, #e9d5ff 0%, #a855f7 40%, #7e22ce 100%); border: 3px solid #9333ea; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 18px rgba(168,85,247,0.3); }
    .tier-grandmaster { background: linear-gradient(145deg, #fca5a5 0%, #e04343 40%, #9e2323 100%); border: 3px solid #d33636; box-shadow: 0 0 16px rgba(220,38,38,0.42); animation: gm-pulse 2.6s ease-in-out infinite; }
    @keyframes gm-pulse { 0%,100% { box-shadow: 0 0 16px rgba(220,38,38,0.42); } 50% { box-shadow: 0 0 26px rgba(220,38,38,0.62), 0 0 54px rgba(220,38,38,0.22); } }

    .tier-challenger { background: linear-gradient(45deg, #f59e0b, #fbbf24, #7c3aed, #3b82f6, #a855f7, #f59e0b); background-size: 300% 300%; border: none; padding: 3px; animation: chall-flow 3s ease infinite; box-shadow: 0 0 20px rgba(245,158,11,0.5); position: relative; overflow: hidden !important; }
    .tier-challenger .card-header, .tier-challenger .card-body { background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c0a1e 100%); }
    .tier-challenger .card-header { border-radius: 13px 13px 0 0; }
    .tier-challenger .card-body { border-radius: 0 0 13px 13px; }
    @keyframes chall-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    /* Legacy / Award tiers */
    /* Champion — imperial coronation (World Championship, the pinnacle title). SOLID technique
       (no padding-frame) so it never reads as a sibling of the gold+emerald EWC frame. A deep
       royal-purple → aubergine → near-black-violet field, dark the whole way down so white text
       reads over the header, the big rating/name AND the bottom stats grid. Grandeur is all GOLD:
       an ornate gold|dark|gold double-trim (one box-shadow), a crown-glow from just above the top
       edge, an inset warm-gold vignette, a pulsing gold halo, and a slow champagne sheen that
       sweeps once then rests off-card. No pseudo-elements; cheap paint-only. */
    .tier-champion {
        background:
            linear-gradient(115deg, transparent 40%, rgba(255,238,190,0.05) 47%, rgba(255,245,208,0.13) 50%, rgba(255,238,190,0.05) 53%, transparent 60%),
            radial-gradient(135% 90% at 50% -16%, rgba(255,214,132,0.15) 0%, rgba(255,206,120,0.05) 34%, rgba(255,206,120,0) 60%),
            linear-gradient(160deg, #3d0f57 0%, #2a0937 40%, #14051f 74%, #0c0316 100%);
        background-size: 250% 100%, 100% 100%, 100% 100%;
        background-position: 200% 0, 0 0, 0 0;
        background-repeat: no-repeat;
        border: 3px solid #ecc766;
        box-shadow:
            0 8px 24px rgba(0,0,0,0.5),
            inset 0 0 0 2px rgba(18,4,26,0.90),
            inset 0 0 0 4px rgba(233,196,106,0.45),
            inset 0 2px 3px rgba(255,240,200,0.16),
            inset 0 0 42px rgba(150,102,26,0.22),
            0 0 22px rgba(224,170,70,0.50),
            0 0 50px rgba(200,150,44,0.16);
        animation: champ-sheen 7s ease-in-out infinite, champ-glow 4s ease-in-out infinite;
    }
    @keyframes champ-sheen {
        0%       { background-position: 200% 0, 0 0, 0 0; }
        55%,100% { background-position: -60% 0, 0 0, 0 0; }
    }
    @keyframes champ-glow {
        0%,100% {
            border-color: #ecc766;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(18,4,26,0.90), inset 0 0 0 4px rgba(233,196,106,0.45), inset 0 2px 3px rgba(255,240,200,0.16), inset 0 0 42px rgba(150,102,26,0.22), 0 0 22px rgba(224,170,70,0.50), 0 0 50px rgba(200,150,44,0.16);
        }
        50% {
            border-color: #ffdd88;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(18,4,26,0.90), inset 0 0 0 4px rgba(255,224,140,0.60), inset 0 2px 3px rgba(255,246,214,0.24), inset 0 0 46px rgba(184,128,36,0.30), 0 0 34px rgba(236,190,80,0.80), 0 0 66px rgba(210,158,50,0.26);
        }
    }
    .tier-mvp { background: linear-gradient(145deg, #4a0426 0%, #2d1055 40%, #be185d 100%); border: 3px solid #ec4899; box-shadow: 0 0 20px rgba(236,72,153,0.5); animation: mvp-pulse 2.8s ease-in-out infinite; }
    @keyframes mvp-pulse { 0%,100% { box-shadow: 0 0 20px rgba(236,72,153,0.5); } 50% { box-shadow: 0 0 34px rgba(236,72,153,0.8); } }
    .tier-finalist { background: linear-gradient(145deg, #0f172a 0%, #334155 40%, #1e293b 100%); border: 3px solid #94a3b8; box-shadow: 0 0 18px rgba(148,163,184,0.4); }
    .tier-msi { background: linear-gradient(145deg, #042f2e 0%, #0f766e 40%, #134e4a 100%); border: 3px solid #2dd4bf; box-shadow: 0 0 18px rgba(45,212,191,0.4); }
    .tier-firststand { background: linear-gradient(145deg, #431407 0%, #c2410c 40%, #7c2d12 100%); border: 3px solid #fb923c; box-shadow: 0 0 16px rgba(251,146,60,0.4); }
    /* EWC — Esports World Cup "Trophy Forge": a brushed molten-gold + emerald-jewel metallic frame
       (border:none + 3px padding, like challenger) wrapping opaque near-black panels so white text
       stays readable. A slow 14s living-metal drift, a tri-hue trophy halo (gold→emerald→champagne,
       no cyan so it never reads as diamond), and a resting champagne→emerald sheen that sweeps the
       WHOLE card once per cycle. No pseudo-elements → never collides with holographic/signature. */
    .tier-ewc {
        border: none;
        padding: 3px;
        background: linear-gradient(135deg,
            #8a6a1a 0%, #d4af37 12%, #f7ecb0 22%, #d4af37 33%, #b8860b 45%,
            #0f9d63 51%, #34d399 55%, #0f9d63 59%, #b8860b 68%, #d4af37 80%, #f7ecb0 90%, #8a6a1a 100%);
        background-size: 300% 300%;
        background-position: 0% 50%;
        box-shadow:
            0 8px 24px rgba(0,0,0,0.45),
            inset 0 3px 0 rgba(255,231,170,0.5),
            0 0 20px rgba(212,175,55,0.45),
            0 0 46px rgba(15,157,99,0.16);
        animation: ewc-drift 14s ease-in-out infinite, ewc-halo 4s ease-in-out infinite;
    }
    .tier-ewc .card-header {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 44%, rgba(255,244,206,0.10) 47%, rgba(255,255,255,0.22) 50%, rgba(168,255,214,0.12) 53%, rgba(255,255,255,0) 56%),
            linear-gradient(160deg, #0d130f 0%, #080b09 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 13px 13px 0 0;
        border-bottom: 1px solid rgba(212,175,55,0.4);
        animation: ewc-sheen 5.5s ease-in-out infinite;
    }
    .tier-ewc .card-body {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 44%, rgba(255,244,206,0.10) 47%, rgba(255,255,255,0.22) 50%, rgba(168,255,214,0.12) 53%, rgba(255,255,255,0) 56%),
            linear-gradient(160deg, #0b110d 0%, #0d1512 45%, #060807 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 0 0 13px 13px;
        box-shadow:
            inset 0 1px 0 rgba(255,248,224,0.12),
            inset 0 0 28px rgba(0,0,0,0.5);
        animation: ewc-sheen 5.5s ease-in-out infinite;
    }
    @keyframes ewc-drift {
        0%, 100% { background-position: 0% 50%; }
        50%      { background-position: 100% 50%; }
    }
    @keyframes ewc-halo {
        0%, 100% {
            box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,231,170,0.5), 0 0 20px rgba(212,175,55,0.45), 0 0 46px rgba(15,157,99,0.16);
        }
        33% {
            box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,238,190,0.6), 0 0 34px rgba(20,190,120,0.6), 0 0 62px rgba(212,175,55,0.22);
        }
        66% {
            box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,244,214,0.62), 0 0 34px rgba(245,224,140,0.7), 0 0 62px rgba(15,157,99,0.24);
        }
    }
    @keyframes ewc-sheen {
        0%   { background-position: 100% 0%, 0% 0%; }
        40%  { background-position: 0% 0%, 0% 0%; }
        100% { background-position: 0% 0%, 0% 0%; }
    }

    /* New award tiers */
    /* POTY — Player of the Year "Crimson Regalia": a brushed CRIMSON metallic frame
       (border:none + 3px padding, like challenger/EWC/TOTY) wrapping OPAQUE midnight-navy
       panels, so the header, the huge rating, the name AND the bottom stats grid all keep
       white text readable — the old flat navy + red-border build read cheap next to
       Champion/EWC. Strictly crimson / rose / midnight with a single cool silver glint in the
       metal: zero gold, so it can never be mistaken for Champion (purple+gold), EWC
       (gold+emerald) or Hall of Legends (red+gold+black). Slow living-metal drift, a breathing
       crimson halo, and one rose sheen that sweeps the face then rests off-card. Paint-only;
       no pseudo-elements, so it never collides with holographic/signature. */
    .tier-poty {
        border: none;
        padding: 3px;
        background: linear-gradient(135deg,
            #40091a 0%, #8c1030 9%, #e94560 18%, #ff93a8 26%, #e94560 34%,
            #c8d2e4 43%, #ffc0cd 48%, #e94560 56%,
            #9c1236 66%, #e94560 78%, #ff9fb0 88%, #40091a 100%);
        background-size: 300% 300%;
        background-position: 0% 50%;
        box-shadow:
            0 8px 24px rgba(0,0,0,0.45),
            inset 0 3px 0 rgba(255,196,210,0.5),
            0 0 20px rgba(233,69,96,0.5),
            0 0 46px rgba(150,20,50,0.18);
        animation: poty-drift 12s ease-in-out infinite, poty-halo 4.5s ease-in-out infinite;
    }
    .tier-poty .card-header {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 40%, rgba(255,210,222,0.10) 45%, rgba(255,240,246,0.24) 50%, rgba(233,69,96,0.14) 55%, rgba(255,255,255,0) 60%),
            linear-gradient(160deg, #16203f 0%, #0d1428 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 13px 13px 0 0;
        border-bottom: 1px solid rgba(233,69,96,0.42);
        animation: poty-sheen 8s ease-in-out infinite;
    }
    .tier-poty .card-body {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 40%, rgba(255,210,222,0.10) 45%, rgba(255,240,246,0.24) 50%, rgba(233,69,96,0.14) 55%, rgba(255,255,255,0) 60%),
            linear-gradient(160deg, #141d3a 0%, #101832 45%, #080d1c 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 0 0 13px 13px;
        box-shadow:
            inset 0 1px 0 rgba(255,214,224,0.12),
            inset 0 0 34px rgba(233,69,96,0.10),
            inset 0 0 28px rgba(0,0,0,0.5);
        animation: poty-sheen 8s ease-in-out infinite;
    }
    /* Crimson trim on the shared sub-elements so the frame colour carries into the face */
    .tier-poty .card-avatar { border-color: rgba(255,150,170,0.42); background: rgba(0,0,0,0.35); }
    .tier-poty .card-stats { border-color: rgba(233,69,96,0.28); }
    .tier-poty .card-role { background: rgba(0,0,0,0.32); }
    @keyframes poty-drift {
        0%, 100% { background-position: 0% 50%; }
        50%      { background-position: 100% 50%; }
    }
    @keyframes poty-halo {
        0%,100% { box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,196,210,0.5), 0 0 20px rgba(233,69,96,0.5), 0 0 46px rgba(150,20,50,0.18); }
        50%     { box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,224,232,0.68), 0 0 34px rgba(255,90,120,0.82), 0 0 68px rgba(180,26,60,0.30); }
    }
    @keyframes poty-sheen {
        0%   { background-position: 100% 0%, 0% 0%; }
        45%  { background-position: 0% 0%, 0% 0%; }
        100% { background-position: 0% 0%, 0% 0%; }
    }
    .tier-roty { background: linear-gradient(145deg, #0d1b2a 0%, #1b263b 40%, #415a77 100%); border: 3px solid #00b4d8; box-shadow: 0 0 18px rgba(0,180,216,0.4); }
    /* TOTY — Team of the Year "All-Star Chrome": a brushed platinum/silver metallic FRAME
       (border:none + 3px padding, like challenger/EWC) wrapping opaque deep-sapphire panels so
       white text stays readable across the whole card (fixes the old navy→orange→near-white bug).
       Strictly cool metal — zero gold, zero cyan — so it stands apart from EWC (gold+emerald), the
       royal-gold Champion, POTY (crimson) and ROTY (cyan). A silver glint drifts around the frame,
       a halo breathes platinum-white over a low sapphire undertone, and a soft sheen sweeps the
       face once then rests off-card. Cheap paint-only; no pseudo-elements. */
    .tier-toty {
        border: none;
        padding: 3px;
        background: linear-gradient(135deg, #29374e 0%, #7d92b4 10%, #d6e4f7 18%, #a9bad8 26%, #43567a 38%, #eef4ff 50%, #6f83a8 62%, #d6e4f7 74%, #8a9fc2 84%, #29374e 100%);
        background-size: 300% 300%;
        background-position: 0% 50%;
        box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,255,255,0.55), 0 0 20px rgba(210,224,243,0.5), 0 0 46px rgba(37,99,235,0.16);
        animation: toty-drift 10s ease-in-out infinite, toty-halo 5s ease-in-out infinite;
    }
    .tier-toty .card-header {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 34%, rgba(236,242,250,0.10) 42%, rgba(255,255,255,0.24) 50%, rgba(236,242,250,0.10) 58%, rgba(255,255,255,0) 66%),
            linear-gradient(160deg, #0c1f4a 0%, #081736 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 13px 13px 0 0;
        border-bottom: 1px solid rgba(180,205,240,0.32);
        animation: toty-sheen 10s ease-in-out infinite;
    }
    .tier-toty .card-body {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 34%, rgba(236,242,250,0.10) 42%, rgba(255,255,255,0.24) 50%, rgba(236,242,250,0.10) 58%, rgba(255,255,255,0) 66%),
            linear-gradient(160deg, #0b1d45 0%, #0c1f4a 45%, #07142f 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 0 0 13px 13px;
        box-shadow: inset 0 1px 0 rgba(210,230,255,0.12), inset 0 0 28px rgba(0,0,0,0.5);
        animation: toty-sheen 10s ease-in-out infinite;
    }
    @keyframes toty-drift {
        0%, 100% { background-position: 0% 50%; }
        50%      { background-position: 100% 50%; }
    }
    @keyframes toty-halo {
        0%, 100% { box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,255,255,0.55), 0 0 20px rgba(210,224,243,0.5), 0 0 46px rgba(37,99,235,0.16); }
        50%      { box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 3px 0 rgba(255,255,255,0.72), 0 0 32px rgba(232,240,251,0.74), 0 0 62px rgba(37,99,235,0.26); }
    }
    @keyframes toty-sheen {
        0%   { background-position: 100% 0%, 0% 0%; }
        40%  { background-position: 0% 0%, 0% 0%; }
        100% { background-position: 0% 0%, 0% 0%; }
    }
    .tier-gpoty { background: linear-gradient(145deg, #0b0c10 0%, #1a1a2e 30%, #533483 100%); border: 3px solid #e0aaff; box-shadow: 0 0 24px rgba(224,170,255,0.4), 0 0 50px rgba(224,170,255,0.15); animation: gpoty-glow 2.5s ease-in-out infinite; }
    @keyframes gpoty-glow { 0%,100% { box-shadow: 0 0 24px rgba(224,170,255,0.4); } 50% { box-shadow: 0 0 38px rgba(224,170,255,0.7), 0 0 70px rgba(224,170,255,0.2); } }
    .tier-x { background: linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 40%, #2d2d2d 100%); border: 3px solid #ff6b6b; box-shadow: 0 0 18px rgba(255,107,107,0.3); animation: x-pulse 2s linear infinite; }
    @keyframes x-pulse { 0%,100% { border-color: #ff6b6b; } 50% { border-color: #ffd93d; } }

    /* Hall of Legends — the apex tier, "Molten Immortality". The heaviest frame in the game
       (border:none + 4px padding, one step thicker than every other padding-frame tier) cast in
       molten crimson → ember → gold metal that drifts slowly, wrapping OPAQUE obsidian panels so
       white text stays legible over a near-black face. Prestige comes from layering: a double
       halo (gold inner, crimson outer) over a deep blood-red bloom, an inset warm vignette, and a
       slow regal gold sheen that sweeps once then rests off-card. Red+gold+black reads instantly
       apart from POTY (crimson+midnight, no gold), Champion (purple+gold), EWC (gold+emerald),
       Grandmaster (plain red) and X (flat black). Paint-only, no pseudo-elements — those belong
       to holographic/signature — and only transform-free background-position/box-shadow animate,
       so a full grid of these stays cheap. */
    .tier-halloflegends {
        border: none;
        padding: 4px;
        background: linear-gradient(135deg,
            #1c0406 0%, #6d0f18 7%, #b81c25 14%, #e63946 20%, #ff7a3d 27%,
            #f0b03c 34%, #ffeeb4 42%, #ffd76e 48%, #d4af37 55%,
            #b8860b 62%, #a3121f 72%, #e63946 80%, #7d0d14 90%, #1c0406 100%);
        background-size: 300% 300%;
        background-position: 0% 50%;
        box-shadow:
            0 10px 30px rgba(0,0,0,0.6),
            inset 0 3px 0 rgba(255,236,186,0.55),
            0 0 18px rgba(255,196,88,0.60),
            0 0 40px rgba(214,40,52,0.42),
            0 0 78px rgba(120,12,20,0.24);
        animation: hol-drift 16s ease-in-out infinite, hol-halo 5.5s ease-in-out infinite;
    }
    .tier-halloflegends .card-header {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 40%, rgba(255,206,120,0.10) 45%, rgba(255,242,208,0.26) 50%, rgba(230,57,70,0.14) 55%, rgba(255,255,255,0) 60%),
            linear-gradient(160deg, #180809 0%, #0a0304 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 12px 12px 0 0;
        border-bottom: 1px solid rgba(255,196,88,0.45);
        animation: hol-sheen 9s ease-in-out infinite;
    }
    .tier-halloflegends .card-body {
        background:
            linear-gradient(110deg, rgba(255,255,255,0) 40%, rgba(255,206,120,0.10) 45%, rgba(255,242,208,0.26) 50%, rgba(230,57,70,0.14) 55%, rgba(255,255,255,0) 60%),
            linear-gradient(160deg, #150708 0%, #1a0a09 45%, #060202 100%);
        background-size: 300% 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: 100% 0%, 0% 0%;
        border-radius: 0 0 12px 12px;
        box-shadow:
            inset 0 1px 0 rgba(255,226,168,0.14),
            inset 0 0 36px rgba(160,28,20,0.32),
            inset 0 0 26px rgba(0,0,0,0.6);
        animation: hol-sheen 9s ease-in-out infinite;
    }
    /* Gilded trim on the shared sub-elements, plus white text forced on regardless of the
       data-text flag — the panels are obsidian, and isDarkCard() lives in utils/cards.js. */
    .card.tier-halloflegends .card-header,
    .card.tier-halloflegends .card-role,
    .card.tier-halloflegends .avatar-initials,
    .card.tier-halloflegends .card-name,
    .card.tier-halloflegends .stat-value { color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.65); }
    .card.tier-halloflegends .card-rating { color: #fff; text-shadow: 0 0 20px rgba(255,180,80,0.45), 0 2px 6px rgba(0,0,0,0.8); }
    .card.tier-halloflegends .card-region,
    .card.tier-halloflegends .card-team { color: rgba(255,232,196,0.72); text-shadow: 0 1px 2px rgba(0,0,0,0.55); }
    .card.tier-halloflegends .stat-label { color: rgba(255,222,178,0.58); }
    .card.tier-halloflegends .card-stats { border-color: rgba(255,196,88,0.24); }
    .tier-halloflegends .card-avatar { border-color: rgba(255,196,88,0.5); background: rgba(0,0,0,0.45); }
    .tier-halloflegends .card-role { background: rgba(0,0,0,0.38); }
    /* "HALL OF LEGENDS" is 15 chars — the generic 11px/2.5px header would wrap on the full card
       and badly on the 180px mini, so tighten it here only (never the shared .card-header rule).
       :not(.sig-header) keeps the Marck Script signature header untouched. */
    .card.tier-halloflegends .card-header:not(.sig-header) { font-size: 10px; letter-spacing: 1.4px; white-space: nowrap; }
    .card-mini.tier-halloflegends .card-header:not(.sig-header) { font-size: 8px; letter-spacing: 0.8px; white-space: nowrap; }
    @keyframes hol-drift {
        0%, 100% { background-position: 0% 50%; }
        50%      { background-position: 100% 50%; }
    }
    @keyframes hol-halo {
        0%, 100% {
            box-shadow: 0 10px 30px rgba(0,0,0,0.6), inset 0 3px 0 rgba(255,236,186,0.55), 0 0 18px rgba(255,196,88,0.60), 0 0 40px rgba(214,40,52,0.42), 0 0 78px rgba(120,12,20,0.24);
        }
        50% {
            box-shadow: 0 10px 30px rgba(0,0,0,0.6), inset 0 3px 0 rgba(255,246,214,0.72), 0 0 28px rgba(255,214,120,0.88), 0 0 56px rgba(230,57,70,0.60), 0 0 96px rgba(160,18,28,0.32);
        }
    }
    @keyframes hol-sheen {
        0%   { background-position: 100% 0%, 0% 0%; }
        42%  { background-position: 0% 0%, 0% 0%; }
        100% { background-position: 0% 0%, 0% 0%; }
    }

    /* Coach */
    .tier-coach { background: linear-gradient(145deg, #022c22 0%, #064e3b 100%); border: 3px dashed #10b981; }

    /* Effects */
    /* Signature — prestigious white light sweep + shimmering white↔gold rim */
    .card-signature { outline: 2px solid rgba(255,255,255,0.6); outline-offset: 2px; animation: sig-glow 2.4s ease-in-out infinite; }
    .card-signature::after { content: ''; position: absolute; top: 0; left: -100%; width: 55%; height: 100%; background: linear-gradient(105deg, transparent 15%, rgba(255,255,255,0.25) 40%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.25) 60%, transparent 85%); mix-blend-mode: screen; animation: sig-sweep 3s ease-in-out infinite; pointer-events: none; border-radius: inherit; z-index: 5; }
    @keyframes sig-glow { 0%,100% { outline-color: rgba(255,255,255,0.55); } 50% { outline-color: rgba(255,215,0,0.9); } }
    @keyframes sig-sweep { 0% { left: -100%; } 55%,100% { left: 145%; } }
    /* Holographic — animated iridescent foil across the card face + soft rainbow glow.
       A faint white wash (baked into holo-glow's inset shadow) gently pales the base
       tier colour so the foil reads clearly instead of drowning in saturated gradients. */
    .card-holographic { animation: holo-glow 5s linear infinite; }
    .card-holographic::before {
        content: ''; position: absolute; inset: 0; border-radius: inherit;
        background:
            linear-gradient(115deg, transparent 0%, transparent 30%, rgba(255,255,255,0.75) 46%, rgba(255,255,255,0.3) 53%, transparent 64%, transparent 100%),
            linear-gradient(125deg, rgba(255,0,132,0.62) 0%, rgba(0,229,255,0.62) 22%, rgba(0,255,148,0.62) 42%, rgba(255,221,0,0.62) 62%, rgba(214,0,255,0.62) 82%, rgba(255,0,132,0.62) 100%);
        background-size: 220% 220%, 260% 260%;
        mix-blend-mode: overlay;
        opacity: 0.85;
        pointer-events: none;
        z-index: 4;
        animation: holo-foil 5s ease-in-out infinite;
    }
    @keyframes holo-foil {
        0%   { background-position: 0% 0%,   0% 50%; }
        50%  { background-position: 100% 100%, 100% 50%; }
        100% { background-position: 0% 0%,   0% 50%; }
    }
    @keyframes holo-glow {
        0%,100% { box-shadow: inset 0 0 0 9999px rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.4), 0 0 26px rgba(255,0,132,0.55); }
        33%     { box-shadow: inset 0 0 0 9999px rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.4), 0 0 26px rgba(0,229,255,0.55); }
        66%     { box-shadow: inset 0 0 0 9999px rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.4), 0 0 26px rgba(0,255,148,0.55); }
    }
</style>
