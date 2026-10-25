<script>
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import { club, squad, blueEssence, trackStats, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, makeUniqueId, ALL_SPECIAL, TIER_COLORS } from '../../utils/cards.js';

    // Combine cards of one role and tier into one random card of the next tier up. The rules
    // are unchanged from the old lab; Challenger cannot be forged (packs only).
    const upgradePaths = [
        { from: 'Bronze', to: 'Silver', count: 10, cost: 50 },
        { from: 'Silver', to: 'Gold', count: 10, cost: 100 },
        { from: 'Gold', to: 'Platinum', count: 10, cost: 200 },
        { from: 'Platinum', to: 'Diamond', count: 8, cost: 400 },
        { from: 'Diamond', to: 'Master', count: 8, cost: 800 },
        { from: 'Master', to: 'Grandmaster', count: 5, cost: 1500 },
    ];
    const roles = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
    const roleIcons = {
        TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png',
        ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png',
    };
    const color = (t) => TIER_COLORS[t] || '#94a3b8';

    let selectedPath = upgradePaths[0];
    let selectedRole = 'TOP';
    let showResult = false;
    let resultCard = null;

    // `ids` is passed in rather than closed over, so every reactive line below that calls this
    // also re-runs when the squad changes (Svelte only tracks names it can see).
    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
    const usable = (c, ids) => !ids.has(c.uniqueId) && !c.locked && !ALL_SPECIAL.includes(c.quality);

    $: eligible = $club.filter(c => c.quality === selectedPath.from && c.role === selectedRole && usable(c, activeSquadIds))
        .sort((a, b) => a.rating - b.rating);
    $: canUpgrade = eligible.length >= selectedPath.count && $blueEssence >= selectedPath.cost;

    // { tier: { role: count } } of usable cards — drives every badge on the page.
    $: counts = (() => {
        const out = {};
        for (const p of upgradePaths) out[p.from] = Object.fromEntries(roles.map(r => [r, 0]));
        for (const c of $club) if (out[c.quality] && out[c.quality][c.role] !== undefined && usable(c, activeSquadIds)) out[c.quality][c.role]++;
        return out;
    })();
    $: readyByPath = Object.fromEntries(upgradePaths.map(p => [p.from,
        $blueEssence >= p.cost ? roles.filter(r => counts[p.from][r] >= p.count).length : 0]));
    $: bestFill = Object.fromEntries(upgradePaths.map(p => [p.from, Math.min(1, Math.max(...roles.map(r => counts[p.from][r])) / p.count)]));
    $: totalReady = Object.values(readyByPath).reduce((s, v) => s + v, 0);

    // What the forge can actually produce for this path and role.
    $: targetPool = (() => {
        const db = getDB();
        if (!db) return [];
        return db.filter(p => p.quality === selectedPath.to && p.role === selectedRole && !ALL_SPECIAL.includes(p.quality));
    })();
    $: poolMin = targetPool.length ? Math.min(...targetPool.map(p => p.rating)) : 0;
    $: poolMax = targetPool.length ? Math.max(...targetPool.map(p => p.rating)) : 0;

    function selectPath(p) {
        selectedPath = p;
        // Jump to a role that can actually forge on this path, if the current one cannot.
        if (counts[p.from][selectedRole] < p.count) {
            const ready = roles.find(r => counts[p.from][r] >= p.count);
            if (ready) selectedRole = ready;
        }
    }

    function performUpgrade() {
        if (!canUpgrade) return;
        const db = getDB();
        if (!db) return;
        const consumeIds = new Set(eligible.slice(0, selectedPath.count).map(c => c.uniqueId));
        let pool = db.filter(p => p.quality === selectedPath.to && p.role === selectedRole && !ALL_SPECIAL.includes(p.quality));
        if (!pool.length) pool = db.filter(p => p.quality === selectedPath.to && !ALL_SPECIAL.includes(p.quality));
        if (!pool.length) { showToast('No cards available for this upgrade tier.', 'error'); return; }

        const pick = pool[Math.floor(Math.random() * pool.length)];
        const newCard = { ...pick, uniqueId: makeUniqueId('upg_') };
        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        blueEssence.update(v => v - selectedPath.cost);
        trackStats.update(s => ({ ...s, upgradesPerformed: (s.upgradesPerformed || 0) + 1 }));

        playSound('rare');
        resultCard = newCard;
        showResult = true;
        saveGame();
        showToast(`Upgraded to ${newCard.name} (${selectedPath.to})!`, 'success');
    }

    function forgeAgain() {
        showResult = false;
        resultCard = null;
        performUpgrade();
    }
</script>

<section class="ul">
    <!-- ── Hero ── -->
    <header class="hero">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-text">
            <span class="eyebrow"><Icon name="upgrade" size={13} stroke={2.2} /> Upgrade Lab</span>
            <h2 class="title">Turn duplicates into a better card</h2>
            <p class="sub">Feed in cards of one role and tier and forge one random card of the tier above. Your squad, locked cards and Legacy/Award cards are never used — and the lowest-rated cards always go first.</p>
        </div>
        <div class="hero-stats">
            <div class="hs" class:hs-on={totalReady > 0}>
                <span class="hs-n">{totalReady}</span>
                <span class="hs-l">ready to forge</span>
            </div>
            <div class="hs">
                <span class="hs-n hs-be"><Icon name="gem" size={16} stroke={2.2} /> {$blueEssence.toLocaleString()}</span>
                <span class="hs-l">Blue Essence</span>
            </div>
        </div>
    </header>

    <!-- ── Tier ladder ── -->
    <div class="ladder">
        {#each upgradePaths as p (p.from)}
            {@const on = selectedPath.from === p.from}
            {@const ready = readyByPath[p.from]}
            <button class="step" class:step-on={on} class:step-ready={ready > 0} style="--a: {color(p.from)}; --b: {color(p.to)};" on:click={() => selectPath(p)}>
                <span class="st-tiers">
                    <span class="st-dot" style="background: {color(p.from)};"></span>{p.from}
                    <Icon name="arrow" size={12} stroke={2.4} />
                    <span class="st-dot" style="background: {color(p.to)};"></span>{p.to}
                </span>
                <span class="st-meta">{p.count} cards · {p.cost.toLocaleString()} BE</span>
                <span class="st-bar"><span style="width: {bestFill[p.from] * 100}%;"></span></span>
                {#if ready > 0}<span class="st-badge">{ready}</span>{/if}
            </button>
        {/each}
    </div>

    <div class="main">
        <!-- ── Forge ── -->
        <div class="forge" style="--a: {color(selectedPath.from)}; --b: {color(selectedPath.to)};">
            <div class="panel-h">Choose a role</div>
            <div class="roles">
                {#each roles as role}
                    {@const n = counts[selectedPath.from][role]}
                    {@const enough = n >= selectedPath.count}
                    <button class="role" class:role-on={selectedRole === role} class:role-ready={enough && $blueEssence >= selectedPath.cost} on:click={() => (selectedRole = role)}>
                        <img src={roleIcons[role]} alt="">
                        <span class="role-n">{role}</span>
                        <span class="role-c" class:role-c-ok={enough}>{n}/{selectedPath.count}</span>
                        <span class="role-bar"><span style="width: {Math.min(1, n / selectedPath.count) * 100}%;"></span></span>
                    </button>
                {/each}
            </div>

            <div class="recipe">
                <div class="in">
                    <div class="stack">
                        {#each Array(Math.min(5, selectedPath.count)) as _, i}
                            <span class="back" style="transform: translateX({(i - 2) * 10}px) rotate({(i - 2) * 5}deg);"></span>
                        {/each}
                        <span class="stack-n">{selectedPath.count}×</span>
                    </div>
                    <span class="rc-tier" style="color: {color(selectedPath.from)};">{selectedPath.from}</span>
                    <span class="rc-sub">{selectedRole}</span>
                </div>
                <div class="arrow">
                    <Icon name="arrow" size={22} stroke={2.4} />
                    <span>{selectedPath.cost.toLocaleString()} BE</span>
                </div>
                <div class="out">
                    <div class="mystery"><span>?</span></div>
                    <span class="rc-tier" style="color: {color(selectedPath.to)};">{selectedPath.to}</span>
                    <span class="rc-sub">{targetPool.length ? `${targetPool.length} possible · ${poolMin}–${poolMax} rated` : `Random ${selectedRole}`}</span>
                </div>
            </div>

            <div class="checks">
                <div class="check" class:ok={eligible.length >= selectedPath.count}>
                    <Icon name={eligible.length >= selectedPath.count ? 'check' : 'close'} size={13} stroke={2.6} />
                    <span>{eligible.length} of {selectedPath.count} {selectedPath.from} {selectedRole} cards</span>
                </div>
                <div class="check" class:ok={$blueEssence >= selectedPath.cost}>
                    <Icon name={$blueEssence >= selectedPath.cost ? 'check' : 'close'} size={13} stroke={2.6} />
                    <span>{selectedPath.cost.toLocaleString()} BE of {$blueEssence.toLocaleString()}</span>
                </div>
            </div>

            <button class="forge-btn" disabled={!canUpgrade} on:click={performUpgrade}>
                {#if eligible.length < selectedPath.count}
                    Need {selectedPath.count - eligible.length} more {selectedPath.from} {selectedRole} card{selectedPath.count - eligible.length === 1 ? '' : 's'}
                {:else if $blueEssence < selectedPath.cost}
                    Need {(selectedPath.cost - $blueEssence).toLocaleString()} more BE
                {:else}
                    <Icon name="sparkle" size={16} stroke={2.2} /> Forge a {selectedPath.to} {selectedRole}
                {/if}
            </button>
        </div>

        <!-- ── Cards going in ── -->
        <div class="pile">
            <div class="panel-h">
                {selectedPath.from} {selectedRole} cards you can use <span class="pile-n">{eligible.length}</span>
            </div>
            {#if eligible.length}
                <p class="pile-sub">{eligible.length >= selectedPath.count ? `The ${selectedPath.count} marked cards go into the forge — always your lowest-rated.` : `Collect ${selectedPath.count - eligible.length} more to forge. Packs, the Archive and Club requests on the Transfer Market all help.`}</p>
                <div class="pile-grid">
                    {#each eligible as card, i (card.uniqueId)}
                        <div class="pile-card" class:used={i < selectedPath.count && canUpgrade}>
                            <Card {card} mini={true} />
                            {#if i < selectedPath.count && canUpgrade}<span class="used-tag">Used</span>{/if}
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="pile-empty">
                    <Icon name="cards" size={28} />
                    <span>No spare {selectedPath.from} {selectedRole} cards yet.</span>
                </div>
            {/if}
        </div>
    </div>
</section>

{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result" style="--b: {color(resultCard.quality)};" on:click={() => (showResult = false)}>
    <div class="result-glow" aria-hidden="true"></div>
    <div class="result-label">Forged · {resultCard.quality}</div>
    <div class="result-card"><Card card={resultCard} /></div>
    <div class="result-actions">
        {#if canUpgrade}
            <button class="result-again" on:click|stopPropagation={forgeAgain}><Icon name="sparkle" size={14} stroke={2.2} /> Forge again</button>
        {/if}
        <button class="result-btn" on:click|stopPropagation={() => (showResult = false)}>Done</button>
    </div>
</div>
{/if}

<style>
    .ul { display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; }

    /* ── Hero ── */
    .hero {
        position: relative; overflow: hidden; display: flex; gap: 24px; align-items: center; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(192,132,252,0.15), transparent 65%), linear-gradient(120deg, #140b1d, #0b0e1a 60%);
        border: 1px solid rgba(192,132,252,0.28);
    }
    .hero-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(250,204,21,0.1), transparent 65%); }
    .hero-text { position: relative; flex: 1; min-width: 260px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #d8b4fe; }
    .title { font-size: clamp(22px, 2.8vw, 30px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 620px; line-height: 1.55; }
    .hero-stats { position: relative; display: flex; gap: 10px; }
    .hs { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 16px; min-width: 130px; border-radius: 16px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.15); }
    .hs-on { border-color: rgba(52,211,153,0.45); background: radial-gradient(circle at 100% 0%, rgba(52,211,153,0.18), transparent 70%), rgba(2,6,23,0.5); }
    .hs-n { display: inline-flex; align-items: center; gap: 6px; font-size: 24px; font-weight: 900; color: #fff; line-height: 1; font-variant-numeric: tabular-nums; }
    .hs-on .hs-n { color: #6ee7b7; }
    .hs-be { color: #7dd3fc; font-size: 20px; }
    .hs-l { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }

    /* ── Ladder ── */
    .ladder { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .step {
        position: relative; display: flex; flex-direction: column; gap: 5px; padding: 11px 12px 14px; border-radius: 14px; cursor: pointer; text-align: left;
        background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); transition: border-color 0.15s, transform 0.15s, background 0.15s;
    }
    .step:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--b) 45%, transparent); }
    .step-on { background: linear-gradient(140deg, color-mix(in srgb, var(--b) 20%, transparent), rgba(12,16,28,0.8)); border-color: color-mix(in srgb, var(--b) 70%, transparent); box-shadow: 0 8px 22px color-mix(in srgb, var(--b) 14%, transparent); }
    .st-tiers { display: flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 900; color: #e2e8f0; white-space: nowrap; overflow: hidden; }
    .st-tiers :global(.ico) { color: #64748b; flex-shrink: 0; }
    .st-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .st-meta { font-size: 10.5px; font-weight: 700; color: #64748b; }
    .st-bar { position: absolute; left: 12px; right: 12px; bottom: 6px; height: 3px; border-radius: 3px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .st-bar span { display: block; height: 100%; border-radius: 3px; background: var(--a); }
    .st-badge { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 100px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; color: #052e16; background: #34d399; box-shadow: 0 2px 8px rgba(52,211,153,0.45); }

    /* ── Main ── */
    .main { display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .panel-h { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; }

    .forge {
        display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px;
        background: linear-gradient(170deg, color-mix(in srgb, var(--b) 9%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 50%);
        border: 1px solid color-mix(in srgb, var(--b) 30%, rgba(71,85,105,0.3));
    }
    .roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .role {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px 12px; border-radius: 12px; cursor: pointer;
        background: rgba(2,6,23,0.45); border: 1px solid rgba(71,85,105,0.3); transition: all 0.15s;
    }
    .role img { width: 22px; height: 22px; opacity: 0.45; }
    .role:hover img, .role-on img { opacity: 1; }
    .role-on { background: rgba(37,99,235,0.18); border-color: rgba(96,165,250,0.6); }
    .role-ready { border-color: rgba(52,211,153,0.5); }
    .role-ready::after { content: ''; position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 6px rgba(52,211,153,0.6); }
    .role-n { font-size: 11px; font-weight: 900; color: #cbd5e1; }
    .role-c { font-size: 10.5px; font-weight: 800; color: #64748b; font-variant-numeric: tabular-nums; }
    .role-c-ok { color: #34d399; }
    .role-bar { position: absolute; left: 8px; right: 8px; bottom: 5px; height: 2px; border-radius: 2px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .role-bar span { display: block; height: 100%; background: var(--a); }

    .recipe { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding: 18px 10px 14px; border-radius: 16px; background: rgba(2,6,23,0.45); }
    .in, .out { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
    .stack { position: relative; width: 84px; height: 100px; display: flex; align-items: center; justify-content: center; }
    .back { position: absolute; width: 58px; height: 82px; border-radius: 10px; background: linear-gradient(160deg, color-mix(in srgb, var(--a) 55%, #0b1220), #0b1220); border: 1px solid color-mix(in srgb, var(--a) 70%, transparent); box-shadow: 0 4px 10px rgba(0,0,0,0.35); }
    .stack-n { position: relative; z-index: 1; font-size: 20px; font-weight: 900; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.7); }
    .mystery { width: 64px; height: 90px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 5px 0; background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--b) 45%, transparent), #0b1220 75%); border: 2px solid var(--b); box-shadow: 0 0 24px color-mix(in srgb, var(--b) 40%, transparent); animation: glow 2.4s ease-in-out infinite; }
    .mystery span { font-size: 30px; font-weight: 900; color: #fff; }
    @keyframes glow { 50% { box-shadow: 0 0 36px color-mix(in srgb, var(--b) 60%, transparent); } }
    .rc-tier { font-size: 14px; font-weight: 900; }
    .rc-sub { font-size: 10.5px; font-weight: 700; color: #64748b; }
    .arrow { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--b); }
    .arrow span { font-size: 10.5px; font-weight: 900; color: #94a3b8; white-space: nowrap; }

    .checks { display: flex; flex-direction: column; gap: 6px; }
    .check { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; font-size: 12.5px; font-weight: 700; color: #fca5a5; background: rgba(127,29,29,0.15); }
    .check.ok { color: #6ee7b7; background: rgba(6,78,59,0.2); }

    .forge-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px; border-radius: 14px; border: none; cursor: pointer; font-size: 14px; font-weight: 900; color: #0b1220; background: linear-gradient(135deg, color-mix(in srgb, var(--b) 80%, #fff), var(--b)); box-shadow: 0 8px 24px color-mix(in srgb, var(--b) 35%, transparent); transition: transform 0.12s, filter 0.12s; }
    .forge-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
    .forge-btn:disabled { background: rgba(30,41,59,0.7); color: #64748b; box-shadow: none; cursor: not-allowed; }

    .pile { display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 20px; background: rgba(12,16,28,0.55); border: 1px solid rgba(71,85,105,0.25); min-height: 200px; }
    .pile-n { padding: 1px 8px; border-radius: 100px; font-size: 10.5px; color: #e2e8f0; background: rgba(51,65,85,0.6); letter-spacing: 0; }
    .pile-sub { font-size: 12.5px; color: #64748b; }
    .pile-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .pile-card { position: relative; zoom: 0.84; }
    .used::after { content: ''; position: absolute; inset: 0; border-radius: 12px; background: rgba(76,29,149,0.35); outline: 2px solid rgba(192,132,252,0.7); pointer-events: none; }
    .used-tag { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 2; padding: 2px 10px; border-radius: 100px; font-size: 11px; font-weight: 900; color: #fff; background: #7c3aed; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .pile-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 30px; color: #475569; font-size: 13px; }

    /* ── Result ── */
    .result { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.9); backdrop-filter: blur(16px); }
    .result-glow { position: absolute; width: 520px; height: 520px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--b) 30%, transparent), transparent 65%); pointer-events: none; }
    .result-label { position: relative; font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; color: var(--b); margin-bottom: 22px; }
    .result-card { position: relative; animation: reveal 0.55s cubic-bezier(0.16,1,0.3,1) forwards; }
    @keyframes reveal { from { opacity: 0; transform: scale(0.5) rotateY(90deg); } to { opacity: 1; transform: none; } }
    .result-actions { position: relative; display: flex; gap: 10px; margin-top: 24px; }
    .result-again { display: inline-flex; align-items: center; gap: 7px; padding: 12px 24px; border-radius: 12px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; color: #0b1220; background: var(--b); }
    .result-btn { padding: 12px 28px; border-radius: 12px; background: rgba(51,65,85,0.45); border: 1px solid rgba(71,85,105,0.3); color: #e2e8f0; font-size: 13px; font-weight: 800; cursor: pointer; }

    @media (max-width: 1100px) {
        .ladder { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .main { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
        .hero { padding: 18px; }
        .hero-stats { width: 100%; }
        .hs { flex: 1; min-width: 0; }
        .ladder { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pile-card { zoom: 0.7; }
    }
</style>
