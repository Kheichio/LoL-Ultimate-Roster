<script>
    // The end-of-match / end-of-tournament screen every mode shares. Purely presentational:
    // the parent has already paid out and saved by the time this renders, and passes the
    // actions it wants as a slot.
    import Icon from '../ui/Icon.svelte';

    export let outcome = 'win';      // 'win' | 'lose' | 'gold' | 'neutral'
    export let kicker = '';
    export let title = '';
    export let subtitle = '';
    export let icon = 'trophy';
    export let blueName = '';
    export let redName = '';
    export let scoreBlue = null;
    export let scoreRed = null;
    /** [{ label, value, tone: 'be' | 'xp' | 'good' | 'bad' | 'info' }] */
    export let rewards = [];

    const SPARKS = Array.from({ length: 14 }, (_, i) => i);
</script>

<div class="mr mr-{outcome}">
    <div class="mr-rays" aria-hidden="true"></div>
    {#if outcome === 'win' || outcome === 'gold'}
        <div class="mr-sparks" aria-hidden="true">
            {#each SPARKS as i}<span class="spark" style="--i: {i};"></span>{/each}
        </div>
    {/if}
    <div class="mr-emblem"><Icon name={icon} size={44} stroke={1.8} /></div>
    {#if kicker}<span class="mr-kicker">{kicker}</span>{/if}
    <h2 class="mr-title">{title}</h2>
    {#if subtitle}<p class="mr-sub">{subtitle}</p>{/if}

    {#if scoreBlue !== null && scoreRed !== null}
        <div class="mr-score">
            <span class="ms-name ms-nb">{blueName}</span>
            <span class="ms-n ms-b">{scoreBlue}</span>
            <span class="ms-dash">–</span>
            <span class="ms-n ms-r">{scoreRed}</span>
            <span class="ms-name ms-nr">{redName}</span>
        </div>
    {/if}

    {#if rewards.length}
        <div class="mr-rewards">
            {#each rewards as r}
                <span class="rw rw-{r.tone || 'info'}">
                    {#if r.tone === 'be'}<Icon name="gem" size={14} stroke={2.2} />{:else if r.tone === 'xp'}<Icon name="star" size={14} stroke={2.2} />{/if}
                    <b>{r.value}</b> {r.label}
                </span>
            {/each}
        </div>
    {/if}

    <div class="mr-actions"><slot /></div>
</div>

<style>
    .mr {
        --c: #34d399;
        position: relative; overflow: hidden; max-width: 760px; margin: 10px auto 0;
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px;
        padding: 40px 28px 30px; border-radius: 28px;
        background: radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--c) 22%, transparent), transparent 70%), linear-gradient(180deg, #0e1426, #090c18);
        border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
        box-shadow: 0 30px 70px rgba(0,0,0,0.45), 0 0 60px color-mix(in srgb, var(--c) 12%, transparent);
        animation: mrIn 0.45s cubic-bezier(.2,.8,.3,1.15) both;
    }
    .mr-win { --c: #34d399; }
    .mr-gold { --c: #fbbf24; }
    .mr-lose { --c: #f87171; }
    .mr-neutral { --c: #94a3b8; }
    @keyframes mrIn { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: none; } }

    .mr-rays { position: absolute; left: 50%; top: 92px; width: 640px; height: 640px; transform: translate(-50%, -50%); pointer-events: none; background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--c) 12%, transparent) 0 8deg, transparent 8deg 22deg); mask: radial-gradient(circle, #000 10%, transparent 60%); -webkit-mask: radial-gradient(circle, #000 10%, transparent 60%); animation: rays 30s linear infinite; }
    .mr-lose .mr-rays, .mr-neutral .mr-rays { opacity: 0.35; animation: none; }
    @keyframes rays { to { transform: translate(-50%, -50%) rotate(360deg); } }

    .mr-sparks { position: absolute; inset: 0; pointer-events: none; }
    .spark { position: absolute; left: 50%; top: 92px; width: 6px; height: 6px; border-radius: 2px; background: var(--c); opacity: 0; animation: spark 1.6s calc(var(--i) * 60ms) ease-out both; transform-origin: center; }
    .spark:nth-child(3n) { background: #fde68a; }
    .spark:nth-child(4n) { background: #93c5fd; }
    @keyframes spark {
        0% { opacity: 1; transform: translate(-50%, -50%) rotate(calc(var(--i) * 26deg)) translateY(0) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) rotate(calc(var(--i) * 26deg)) translateY(-150px) scale(0.4); }
    }

    .mr-emblem {
        position: relative; width: 96px; height: 96px; border-radius: 30px; margin-bottom: 6px;
        display: flex; align-items: center; justify-content: center; color: #fff;
        background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 85%, #fff), color-mix(in srgb, var(--c) 45%, #000));
        box-shadow: 0 0 0 8px color-mix(in srgb, var(--c) 12%, transparent), 0 0 50px color-mix(in srgb, var(--c) 50%, transparent);
        animation: emblemPop 0.6s 0.1s cubic-bezier(.2,.8,.3,1.6) both;
    }
    .mr-lose .mr-emblem { color: #fee2e2; }
    @keyframes emblemPop { from { transform: scale(0.3) rotate(-20deg); opacity: 0; } to { transform: none; opacity: 1; } }
    .mr-kicker { position: relative; font-size: 11px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: color-mix(in srgb, var(--c) 80%, #fff); }
    .mr-title { position: relative; font-size: clamp(30px, 5vw, 46px); font-weight: 900; letter-spacing: -0.8px; line-height: 1.02; color: #fff; text-shadow: 0 0 40px color-mix(in srgb, var(--c) 45%, transparent); }
    .mr-gold .mr-title { background: linear-gradient(135deg, #fef3c7, #fbbf24 50%, #f59e0b); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .mr-sub { position: relative; font-size: 14px; color: #94a3b8; max-width: 520px; }

    .mr-score { position: relative; display: flex; align-items: center; gap: 12px; margin-top: 6px; padding: 10px 18px; border-radius: 16px; background: rgba(2,6,23,0.6); border: 1px solid rgba(148,163,184,0.15); }
    .ms-name { font-size: 13px; font-weight: 800; color: #cbd5e1; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ms-n { font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .ms-b { color: #60a5fa; }
    .ms-r { color: #f87171; }
    .ms-dash { font-size: 22px; color: #475569; font-weight: 900; }

    .mr-rewards { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 6px; }
    .rw { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 100px; font-size: 13px; font-weight: 700; color: #cbd5e1; background: rgba(15,23,42,0.75); border: 1px solid rgba(71,85,105,0.35); }
    .rw b { font-weight: 900; color: #fff; }
    .rw-be { border-color: rgba(56,189,248,0.4); color: #7dd3fc; }
    .rw-xp { border-color: rgba(167,139,250,0.4); color: #c4b5fd; }
    .rw-good { border-color: rgba(52,211,153,0.4); color: #6ee7b7; }
    .rw-bad { border-color: rgba(248,113,113,0.4); color: #fca5a5; }

    .mr-actions { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 14px; }
    .mr-actions :global(.mr-btn) {
        display: inline-flex; align-items: center; gap: 8px; padding: 13px 26px; border-radius: 14px; cursor: pointer;
        font-size: 14px; font-weight: 900; border: none; color: #0b1020;
        background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c));
        box-shadow: 0 8px 24px color-mix(in srgb, var(--c) 35%, transparent);
    }
    .mr-actions :global(.mr-btn:hover) { transform: translateY(-2px); }
    .mr-actions :global(.mr-btn-ghost) {
        display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 14px; cursor: pointer;
        font-size: 14px; font-weight: 800; color: #e2e8f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
    }
    .mr-actions :global(.mr-btn-ghost:hover) { background: rgba(255,255,255,0.12); }

    @media (max-width: 560px) {
        .mr { padding: 32px 16px 22px; }
        .ms-name { display: none; }
    }
</style>
