<script>
    // The in-match screen for every Ultimate Roster mode (Tournament and its variants, Season,
    // Infinity Tower, Draft). It owns no game logic: the parent resolves each round exactly as
    // before and hands the result back through `log`. This component only presents it — a
    // broadcast scorebar, both lineups, the three plays with their real odds, a clash reveal
    // when a round resolves, and the series win probability.
    //
    // Contract with the parent:
    //   on:pick      -> resolve the round (append to `log`, update the score)
    //   on:revealed  -> the reveal for the newest round has finished. A parent that ends the
    //                   match on this pick should switch screens HERE, not inside its pick
    //                   handler, or the deciding round is never shown.
    import { createEventDispatcher, onDestroy } from 'svelte';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';
    import Icon from '../ui/Icon.svelte';
    import PlayerPlate from './PlayerPlate.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { playSound } from '../../utils/sound.js';
    import { roundWinChance, seriesWinChance, STAT_META, STAT_ORDER } from './matchMath.js';

    export let title = 'Match';
    export let subtitle = '';
    export let accent = '#6366f1';
    export let icon = 'swords';
    /** { name, logo, power, lineup: [{ role, card, flex }], stats: { mec..cmp } } */
    export let blue;
    export let red;
    export let plays = [];          // the three on offer this round
    export let allPlays = [];       // every play the CPU might choose (uniformly)
    export let scoreBlue = 0;
    export let scoreRed = 0;
    export let winsNeeded = 2;
    export let log = [];
    export let tactics = 0;
    /** Extra context chips: [{ text, tone: 'good' | 'bad' | 'info' }] */
    export let chips = [];

    const dispatch = createEventDispatcher();
    const REVEAL_MS = 2000;

    const meta = (stat) => STAT_META[stat] || STAT_META.mec;
    $: bs = (blue && blue.stats) || {};
    $: rs = (red && red.stats) || {};
    $: cpuStatPool = allPlays.map(p => rs[p.stat] || 0);
    $: cpuStatAvg = cpuStatPool.length ? Math.round(cpuStatPool.reduce((a, b) => a + b, 0) / cpuStatPool.length) : 0;
    $: offers = plays.map(p => ({ play: p, chance: roundWinChance(blue.power, red.power, bs[p.stat] || 0, cpuStatPool) }));
    $: bestChance = Math.max(0, ...offers.map(o => o.chance));
    // Only flag a "best" play when it actually beats another option.
    $: hasBest = offers.some(o => bestChance - o.chance > 1e-9);
    $: matchOver = scoreBlue >= winsNeeded || scoreRed >= winsNeeded;
    $: seriesP = scoreBlue >= winsNeeded ? 1 : scoreRed >= winsNeeded ? 0 : seriesWinChance({
        myPower: blue.power, cpuPower: red.power, myStats: bs, cpuStatPool,
        allStats: allPlays.map(p => p.stat), offered: reveal ? [] : plays, scoreBlue, scoreRed, winsNeeded,
    });
    const series = tweened(0.5, { duration: 800, easing: cubicOut });
    $: series.set(seriesP);

    // ── The reveal ──
    let seen = log.length;
    let reveal = null;
    let stage = 0;            // 0 plays face off, 1 numbers roll, 2 verdict
    let timers = [];
    const myNum = tweened(0, { duration: 650, easing: cubicOut });
    const cpuNum = tweened(0, { duration: 650, easing: cubicOut });

    $: onLog(log);
    function onLog(l) {
        if (l.length < seen) { seen = l.length; return; }        // a fresh match
        if (l.length > seen) { seen = l.length; startReveal(l[l.length - 1]); }
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function startReveal(e) {
        clearTimers();
        reveal = e;
        stage = 0;
        myNum.set(e.myBase, { duration: 0 });
        cpuNum.set(e.cpuBase, { duration: 0 });
        timers.push(setTimeout(() => { stage = 1; myNum.set(e.myVal); cpuNum.set(e.cpuVal); }, 480));
        timers.push(setTimeout(() => { stage = 2; playSound(e.won ? 'claim' : 'click'); }, 1200));
        timers.push(setTimeout(finishReveal, REVEAL_MS));
    }
    function finishReveal() {
        clearTimers();
        reveal = null;
        stage = 0;
        dispatch('revealed');
    }
    function skip() {
        if (!reveal) return;
        myNum.set(reveal.myVal, { duration: 0 });
        cpuNum.set(reveal.cpuVal, { duration: 0 });
        finishReveal();
    }
    onDestroy(clearTimers);

    $: canPick = !reveal && !matchOver;
    function pick(play) {
        if (!canPick) return;
        dispatch('pick', play);
    }
    function onKey(e) {
        if (!canPick || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        const i = ['1', '2', '3'].indexOf(e.key);
        if (i >= 0 && offers[i]) { e.preventDefault(); pick(offers[i].play); }
    }

    $: roundNo = log.length + (reveal ? 0 : 1);
    $: bestOf = winsNeeded * 2 - 1;
    // 100% and 0% are reserved for outcomes that genuinely are certain — a 99.6% game must
    // not read as a sure thing.
    const pct = (p) => (p >= 1 ? 100 : p <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(p * 100))));
    const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
    $: statMax = Math.max(100, ...STAT_ORDER.map(s => Math.max(bs[s] || 0, rs[s] || 0)));
    $: offeredStats = new Set(plays.map(p => p.stat));
</script>

<svelte:window on:keydown={onKey} />

<div class="ma" style="--acc: {accent};">
    <!-- ═══ BROADCAST SCOREBAR ═══ -->
    <header class="bc">
        <div class="bc-team bc-blue">
            <span class="bc-logo">{blue.logo || '🛡️'}</span>
            <span class="bc-tt">
                <span class="bc-name">{blue.name}</span>
                <span class="bc-pw"><Icon name="bolt" size={11} stroke={2.4} /> {blue.power} power</span>
            </span>
            <span class="bc-score">{scoreBlue}</span>
        </div>
        <div class="bc-mid">
            <span class="bc-mode"><Icon name={icon} size={13} stroke={2.2} /> {title}</span>
            <div class="bc-pips" aria-label="{scoreBlue} to {scoreRed}, first to {winsNeeded}">
                {#each Array(winsNeeded) as _, i}<span class="pip pip-b" class:pip-on={i < scoreBlue}></span>{/each}
                <span class="pip-sep"></span>
                {#each Array(winsNeeded) as _, i}<span class="pip pip-r" class:pip-on={winsNeeded - 1 - i < scoreRed}></span>{/each}
            </div>
            <span class="bc-sub">{subtitle ? `${subtitle} · ` : ''}Best of {bestOf}</span>
        </div>
        <div class="bc-team bc-red">
            <span class="bc-score">{scoreRed}</span>
            <span class="bc-tt bc-tt-r">
                <span class="bc-name">{red.name}</span>
                <span class="bc-pw">{red.power} power <Icon name="bolt" size={11} stroke={2.4} /></span>
            </span>
            <span class="bc-logo bc-logo-r">{red.logo || '⚔️'}</span>
        </div>
    </header>

    <!-- Win probability -->
    <div class="wp" title="Chance of winning the series from here, assuming you take the best play each round">
        <span class="wp-n wp-nb">{pct($series)}%</span>
        <div class="wp-bar">
            <div class="wp-fill" style="width: {$series * 100}%;"></div>
            <span class="wp-mid"></span>
        </div>
        <span class="wp-n wp-nr">{100 - pct($series)}%</span>
        <span class="wp-cap">Win probability</span>
    </div>

    <div class="grid">
        <!-- ═══ BLUE LINEUP ═══ -->
        <aside class="lineup lu-blue">
            <div class="lu-head"><span class="lu-dot"></span> {blue.name}</div>
            {#each blue.lineup as p, i (p.role)}
                <PlayerPlate role={p.role} card={p.card} flex={p.flex} side="blue" delay={i * 50} />
            {/each}
        </aside>

        <!-- ═══ STAGE ═══ -->
        <main class="stage">
            {#if reveal}
                {@const e = reveal}
                {@const mm = meta(e.myPlay.stat)}
                {@const cm = meta(e.cpuPlay.stat)}
                <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="clash" class:clash-won={stage === 2 && e.won} class:clash-lost={stage === 2 && !e.won} on:click={skip}>
                    <div class="cl-round">Game {log.length}</div>
                    <div class="cl-row">
                        <div class="cl-side cl-b" class:cl-winner={stage === 2 && e.won} class:cl-loser={stage === 2 && !e.won}>
                            <span class="cl-token" style="--c: {mm.c};"><Icon name={mm.icon} size={30} /></span>
                            <span class="cl-pname">{e.myPlay.label}</span>
                            <span class="cl-num">{Math.round($myNum)}</span>
                            <span class="cl-eq" class:cl-eq-on={stage >= 1}>
                                <span>{e.myBase} power</span>
                                <span class:eq-pos={e.statEdge > 0} class:eq-neg={e.statEdge < 0}>{signed(e.statEdge)} edge</span>
                                <span class:eq-pos={e.myRoll > 0} class:eq-neg={e.myRoll < 0}>{signed(e.myRoll)} luck</span>
                            </span>
                        </div>
                        <div class="cl-vs">VS</div>
                        <div class="cl-side cl-r" class:cl-winner={stage === 2 && !e.won} class:cl-loser={stage === 2 && e.won}>
                            <span class="cl-token" style="--c: {cm.c};"><Icon name={cm.icon} size={30} /></span>
                            <span class="cl-pname">{e.cpuPlay.label}</span>
                            <span class="cl-num">{Math.round($cpuNum)}</span>
                            <span class="cl-eq" class:cl-eq-on={stage >= 1}>
                                <span>{e.cpuBase} power</span>
                                <span class:eq-pos={e.cpuRoll > 0} class:eq-neg={e.cpuRoll < 0}>{signed(e.cpuRoll)} luck</span>
                            </span>
                        </div>
                    </div>
                    <div class="cl-verdict" class:cl-verdict-on={stage === 2}>
                        {#if stage === 2}{e.won ? 'Game won' : 'Game lost'}{:else}&nbsp;{/if}
                    </div>
                    <div class="cl-skip">Click to skip</div>
                </div>
            {:else if matchOver}
                <div class="done" class:done-won={scoreBlue >= winsNeeded}>
                    <Icon name={scoreBlue >= winsNeeded ? 'trophy' : 'shield'} size={30} />
                    <span>{scoreBlue >= winsNeeded ? 'Victory' : 'Defeat'} · {scoreBlue}–{scoreRed}</span>
                </div>
            {:else}
                <div class="choose">
                    <div class="ch-head">
                        <span class="ch-round">Game {roundNo}</span>
                        <span class="ch-title">Choose your play</span>
                        <span class="ch-keys">Keys 1 · 2 · 3</span>
                    </div>
                    {#if tactics > 0 || chips.length}
                        <div class="ch-chips">
                            {#if tactics > 0}<span class="chip chip-info"><Icon name="skills" size={11} /> Tactics +{tactics} to every stat</span>{/if}
                            {#each chips as c}<span class="chip chip-{c.tone || 'info'}">{c.text}</span>{/each}
                        </div>
                    {/if}
                    {#key log.length}
                        <div class="plays">
                            {#each offers as o, i (o.play.id)}
                                {@const m = meta(o.play.stat)}
                                {@const mine = bs[o.play.stat] || 0}
                                {@const edge = mine - cpuStatAvg}
                                <button class="pc" class:pc-best={hasBest && o.chance === bestChance} style="--c: {m.c}; animation-delay: {i * 70}ms;" on:click={() => pick(o.play)} use:pressFx={{ color: `${m.c}55` }}>
                                    <span class="pc-key">{i + 1}</span>
                                    {#if hasBest && o.chance === bestChance}<span class="pc-tag">Best odds</span>{/if}
                                    <span class="pc-ico"><Icon name={m.icon} size={28} /></span>
                                    <span class="pc-name">{o.play.label}</span>
                                    <span class="pc-blurb">{o.play.desc || m.blurb}</span>
                                    <span class="pc-stat">
                                        <span>Your {m.short} <b>{mine}</b></span>
                                        <span class:eq-pos={edge > 0} class:eq-neg={edge < 0}>{signed(edge)} vs their avg</span>
                                    </span>
                                    <span class="pc-meter"><span class="pc-fill" style="width: {pct(o.chance)}%;"></span></span>
                                    <span class="pc-chance"><b>{pct(o.chance)}%</b> to win the game</span>
                                </button>
                            {/each}
                        </div>
                    {/key}
                </div>
            {/if}

            <!-- Stat duel -->
            <section class="duel">
                <div class="duel-head"><span class="lu-dot"></span> Squad stats <span class="duel-vs">vs</span> <span class="lu-dot lu-dot-r"></span></div>
                {#each STAT_ORDER as s}
                    {@const m = meta(s)}
                    {@const a = bs[s] || 0}
                    {@const b = rs[s] || 0}
                    <div class="dr" class:dr-on={offeredStats.has(s) && !reveal && !matchOver} style="--c: {m.c};">
                        <span class="dr-v dr-vb" class:dr-lead={a > b}>{a}</span>
                        <div class="dr-bar dr-bar-b"><div class="dr-fill" style="width: {(a / statMax) * 100}%;"></div></div>
                        <span class="dr-lbl"><Icon name={m.icon} size={12} /> {m.short}</span>
                        <div class="dr-bar dr-bar-r"><div class="dr-fill" style="width: {(b / statMax) * 100}%;"></div></div>
                        <span class="dr-v dr-vr" class:dr-lead={b > a}>{b}</span>
                    </div>
                {/each}
            </section>

            <!-- Round history -->
            {#if log.length}
                <section class="hist">
                    {#each log as l, i}
                        <div class="hr" class:hr-w={l.won} class:hr-l={!l.won} class:hr-pending={reveal && i === log.length - 1}>
                            <span class="hr-n">G{i + 1}</span>
                            <span class="hr-p" style="color: {meta(l.myPlay.stat).c};"><Icon name={meta(l.myPlay.stat).icon} size={13} /></span>
                            <span class="hr-score">{reveal && i === log.length - 1 ? '…' : `${l.myVal}–${l.cpuVal}`}</span>
                            <span class="hr-p" style="color: {meta(l.cpuPlay.stat).c};"><Icon name={meta(l.cpuPlay.stat).icon} size={13} /></span>
                            <span class="hr-res">{reveal && i === log.length - 1 ? '' : l.won ? 'W' : 'L'}</span>
                        </div>
                    {/each}
                </section>
            {/if}

            <slot name="extra" />
        </main>

        <!-- ═══ RED LINEUP ═══ -->
        <aside class="lineup lu-red">
            <div class="lu-head lu-head-r">{red.name} <span class="lu-dot lu-dot-r"></span></div>
            {#each red.lineup as p, i (p.role)}
                <PlayerPlate role={p.role} card={p.card} flex={p.flex} side="red" delay={i * 50} />
            {/each}
        </aside>
    </div>
</div>

<style>
    .ma { --blue: #60a5fa; --red: #f87171; display: flex; flex-direction: column; gap: 14px; }

    /* ═══ Scorebar ═══ */
    .bc {
        position: relative; display: grid; grid-template-columns: 1fr auto 1fr; align-items: stretch;
        border-radius: 22px; overflow: hidden;
        background: linear-gradient(90deg, rgba(30,64,175,0.55) 0%, rgba(11,15,28,0.95) 30%, rgba(11,15,28,0.95) 70%, rgba(153,27,27,0.5) 100%);
        border: 1px solid rgba(148,163,184,0.18);
        box-shadow: 0 18px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
    }
    .bc::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(90deg, var(--blue), transparent 35%, transparent 65%, var(--red)); }
    .bc-team { display: flex; align-items: center; gap: 12px; padding: 14px 18px; min-width: 0; }
    .bc-red { justify-content: flex-end; }
    .bc-logo { width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 28px; background: rgba(2,6,23,0.55); border: 1px solid rgba(96,165,250,0.4); box-shadow: 0 0 18px rgba(59,130,246,0.25); }
    .bc-logo-r { border-color: rgba(248,113,113,0.4); box-shadow: 0 0 18px rgba(239,68,68,0.22); }
    .bc-tt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .bc-tt-r { align-items: flex-end; text-align: right; }
    .bc-name { font-size: 17px; font-weight: 900; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.2px; }
    .bc-pw { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; color: #a5b4fc; text-transform: uppercase; letter-spacing: 1px; }
    .bc-red .bc-pw { color: #fca5a5; }
    .bc-score { font-size: 44px; font-weight: 900; line-height: 1; color: #fff; font-variant-numeric: tabular-nums; min-width: 34px; text-align: center; text-shadow: 0 0 24px rgba(96,165,250,0.6); }
    .bc-red .bc-score { text-shadow: 0 0 24px rgba(248,113,113,0.6); }
    .bc-mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 12px 26px; background: rgba(2,6,23,0.65); border-left: 1px solid rgba(148,163,184,0.12); border-right: 1px solid rgba(148,163,184,0.12); }
    .bc-mode { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: var(--acc); white-space: nowrap; }
    .bc-pips { display: flex; align-items: center; gap: 5px; }
    .pip { width: 22px; height: 6px; border-radius: 6px; background: rgba(51,65,85,0.8); transition: background 0.3s, box-shadow 0.3s; }
    .pip-b.pip-on { background: var(--blue); box-shadow: 0 0 10px var(--blue); }
    .pip-r.pip-on { background: var(--red); box-shadow: 0 0 10px var(--red); }
    .pip-sep { width: 1px; height: 12px; background: rgba(148,163,184,0.4); margin: 0 4px; }
    .bc-sub { font-size: 10.5px; font-weight: 700; color: #7c8aa0; white-space: nowrap; }

    /* Win probability */
    .wp { display: grid; grid-template-columns: 52px 1fr 52px; grid-template-rows: auto auto; align-items: center; column-gap: 10px; padding: 0 6px; }
    .wp-n { font-size: 13px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .wp-nb { color: var(--blue); text-align: right; }
    .wp-nr { color: var(--red); }
    .wp-bar { position: relative; height: 10px; border-radius: 10px; background: linear-gradient(90deg, #7f1d1d, #ef4444); overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
    .wp-fill { height: 100%; background: linear-gradient(90deg, #1d4ed8, #60a5fa); box-shadow: 4px 0 14px rgba(96,165,250,0.6); }
    .wp-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; background: rgba(255,255,255,0.35); }
    .wp-cap { grid-column: 2; text-align: center; font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; margin-top: 4px; }

    /* ═══ Grid ═══ */
    .grid { display: grid; grid-template-columns: 260px minmax(0, 1fr) 260px; gap: 16px; align-items: start; }

    /* Lineups */
    .lineup { display: flex; flex-direction: column; gap: 6px; }
    .lu-head { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; color: #93c5fd; padding: 0 4px 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .lu-head-r { justify-content: flex-end; color: #fca5a5; }
    .lu-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 8px var(--blue); flex-shrink: 0; }
    .lu-dot-r { background: var(--red); box-shadow: 0 0 8px var(--red); }
    @keyframes plateIn { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }

    /* ═══ Stage ═══ */
    .stage { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    .choose {
        position: relative; padding: 18px; border-radius: 22px;
        background: radial-gradient(100% 70% at 50% 0%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 70%), rgba(10,14,26,0.75);
        border: 1px solid color-mix(in srgb, var(--acc) 28%, rgba(71,85,105,0.3));
    }
    .ch-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
    .ch-round { font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: var(--acc); }
    .ch-title { font-size: 20px; font-weight: 900; color: #fff; letter-spacing: -0.3px; }
    .ch-keys { margin-left: auto; font-size: 10px; font-weight: 800; color: #475569; letter-spacing: 1px; }
    .ch-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 100px; }
    .chip-info { color: #c4b5fd; background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3); }
    .chip-good { color: #6ee7b7; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); }
    .chip-bad { color: #fca5a5; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); }

    .plays { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .pc {
        position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;
        padding: 20px 14px 16px; border-radius: 18px; cursor: pointer; color: #fff;
        background:
            radial-gradient(180px 120px at var(--mx, 50%) var(--my, 0%), color-mix(in srgb, var(--c) 22%, transparent), transparent 70%),
            linear-gradient(180deg, color-mix(in srgb, var(--c) 12%, #0e1424), #0a0e1a 80%);
        border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
        transition: transform 0.18s cubic-bezier(.2,.8,.3,1.3), box-shadow 0.18s, border-color 0.18s;
        animation: cardIn 0.42s cubic-bezier(.2,.8,.3,1.2) both;
    }
    @keyframes cardIn { from { opacity: 0; transform: translateY(18px) scale(0.96); } to { opacity: 1; transform: none; } }
    .pc:hover { transform: translateY(-6px); border-color: var(--c); box-shadow: 0 18px 36px color-mix(in srgb, var(--c) 25%, transparent); }
    .pc:active { transform: translateY(-2px) scale(0.98); }
    .pc-best { border-color: color-mix(in srgb, var(--c) 70%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent), 0 10px 28px color-mix(in srgb, var(--c) 18%, transparent); }
    .pc-key { position: absolute; top: 10px; left: 12px; z-index: 1; width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #94a3b8; background: rgba(2,6,23,0.6); border: 1px solid rgba(148,163,184,0.25); }
    .pc-tag { position: absolute; top: 10px; right: 10px; z-index: 1; font-size: 8.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #0b1020; background: var(--c); padding: 3px 8px; border-radius: 100px; }
    .pc-ico { position: relative; z-index: 1; width: 62px; height: 62px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; margin: 6px 0 4px; background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 90%, #fff), color-mix(in srgb, var(--c) 55%, #000)); box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 14%, transparent), 0 0 26px color-mix(in srgb, var(--c) 45%, transparent); }
    .pc-name { position: relative; z-index: 1; font-size: 17px; font-weight: 900; }
    .pc-blurb { position: relative; z-index: 1; font-size: 11.5px; color: #94a3b8; line-height: 1.4; min-height: 32px; }
    .pc-stat { position: relative; z-index: 1; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; font-size: 11px; font-weight: 700; color: #94a3b8; margin-top: 2px; }
    .pc-stat b { color: #fff; }
    .pc-meter { position: relative; z-index: 1; width: 100%; height: 6px; border-radius: 6px; background: rgba(30,41,59,0.9); overflow: hidden; margin-top: 4px; }
    .pc-fill { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 60%, #000), var(--c)); }
    .pc-chance { position: relative; z-index: 1; font-size: 11px; font-weight: 700; color: #94a3b8; }
    .pc-chance b { font-size: 15px; font-weight: 900; color: #fff; }
    .eq-pos { color: #6ee7b7 !important; }
    .eq-neg { color: #fca5a5 !important; }

    /* Clash */
    .clash {
        position: relative; overflow: hidden; cursor: pointer; padding: 18px 18px 14px; border-radius: 22px; text-align: center;
        background: radial-gradient(80% 100% at 0% 50%, rgba(37,99,235,0.18), transparent 60%), radial-gradient(80% 100% at 100% 50%, rgba(220,38,38,0.16), transparent 60%), rgba(8,11,22,0.92);
        border: 1px solid rgba(148,163,184,0.2);
        transition: border-color 0.3s, box-shadow 0.3s;
    }
    .clash-won { border-color: rgba(52,211,153,0.55); box-shadow: 0 0 40px rgba(16,185,129,0.18); }
    .clash-lost { border-color: rgba(248,113,113,0.5); box-shadow: 0 0 40px rgba(239,68,68,0.15); }
    .cl-round { font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; }
    .cl-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; margin: 10px 0 6px; }
    .cl-side { display: flex; flex-direction: column; align-items: center; gap: 5px; transition: opacity 0.3s, transform 0.3s, filter 0.3s; }
    .cl-b { animation: slideL 0.45s cubic-bezier(.2,.8,.3,1.2) both; }
    .cl-r { animation: slideR 0.45s cubic-bezier(.2,.8,.3,1.2) both; }
    @keyframes slideL { from { opacity: 0; transform: translateX(-60px); } to { opacity: 1; transform: none; } }
    @keyframes slideR { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: none; } }
    .cl-token { width: 68px; height: 68px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 90%, #fff), color-mix(in srgb, var(--c) 50%, #000)); box-shadow: 0 0 30px color-mix(in srgb, var(--c) 55%, transparent); }
    .cl-pname { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .cl-num { font-size: 52px; font-weight: 900; line-height: 1; color: #fff; font-variant-numeric: tabular-nums; }
    .cl-b .cl-num { text-shadow: 0 0 28px rgba(96,165,250,0.7); }
    .cl-r .cl-num { text-shadow: 0 0 28px rgba(248,113,113,0.7); }
    .cl-eq { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; font-size: 10.5px; font-weight: 800; color: #64748b; opacity: 0; transition: opacity 0.3s; }
    .cl-eq span { padding: 2px 7px; border-radius: 6px; background: rgba(30,41,59,0.7); color: #94a3b8; }
    .cl-eq-on { opacity: 1; }
    .cl-vs { font-size: 22px; font-weight: 900; font-style: italic; color: #fff; padding: 10px; border-radius: 50%; background: linear-gradient(135deg, #1d4ed8, #b91c1c); box-shadow: 0 0 24px rgba(129,140,248,0.4); animation: vsPop 0.5s 0.15s cubic-bezier(.2,.8,.3,1.6) both; }
    @keyframes vsPop { from { transform: scale(0) rotate(-30deg); } to { transform: none; } }
    .cl-winner { transform: scale(1.06); }
    .cl-loser { opacity: 0.4; filter: grayscale(0.6); transform: scale(0.95); }
    .cl-verdict { font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; opacity: 0; transform: scale(0.8); transition: opacity 0.25s, transform 0.3s cubic-bezier(.2,.8,.3,1.6); }
    .cl-verdict-on { opacity: 1; transform: none; }
    .clash-won .cl-verdict { color: #34d399; text-shadow: 0 0 24px rgba(52,211,153,0.6); }
    .clash-lost .cl-verdict { color: #f87171; text-shadow: 0 0 24px rgba(248,113,113,0.5); }
    .cl-skip { font-size: 9.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #334155; margin-top: 4px; }

    .done { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 26px; border-radius: 22px; font-size: 20px; font-weight: 900; color: #f87171; background: rgba(127,29,29,0.15); border: 1px solid rgba(248,113,113,0.35); }
    .done-won { color: #34d399; background: rgba(6,78,59,0.18); border-color: rgba(52,211,153,0.4); }

    /* Stat duel */
    .duel { padding: 14px 16px; border-radius: 18px; background: rgba(10,14,26,0.65); border: 1px solid rgba(71,85,105,0.25); display: flex; flex-direction: column; gap: 7px; }
    .duel-head { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
    .duel-vs { color: #334155; }
    .dr { display: grid; grid-template-columns: 34px 1fr 78px 1fr 34px; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 10px; transition: background 0.2s; }
    .dr-on { background: color-mix(in srgb, var(--c) 9%, transparent); }
    .dr-v { font-size: 13px; font-weight: 900; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .dr-vb { text-align: right; }
    .dr-lead { color: #fff; }
    .dr-bar { height: 7px; border-radius: 7px; background: rgba(30,41,59,0.9); overflow: hidden; display: flex; }
    .dr-bar-b { justify-content: flex-end; }
    .dr-bar-b .dr-fill { background: linear-gradient(90deg, #1e3a8a, #60a5fa); border-radius: 7px; }
    .dr-bar-r .dr-fill { background: linear-gradient(90deg, #f87171, #7f1d1d); border-radius: 7px; }
    .dr-fill { height: 100%; transition: width 0.5s ease; }
    .dr-lbl { display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 10.5px; font-weight: 900; letter-spacing: 1px; color: var(--c); }

    /* History */
    .hist { display: flex; flex-wrap: wrap; gap: 6px; }
    .hr { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 12px; font-size: 12px; font-weight: 800; background: rgba(15,23,42,0.7); border: 1px solid rgba(71,85,105,0.3); color: #cbd5e1; font-variant-numeric: tabular-nums; animation: plateIn 0.3s both; }
    .hr-w { border-color: rgba(52,211,153,0.4); }
    .hr-l { border-color: rgba(248,113,113,0.35); }
    .hr-pending { border-color: rgba(148,163,184,0.4); }
    .hr-n { font-size: 10px; color: #64748b; }
    .hr-p { display: flex; }
    .hr-res { font-weight: 900; }
    .hr-w .hr-res { color: #34d399; }
    .hr-l .hr-res { color: #f87171; }

    /* ═══ Responsive ═══ */
    @media (max-width: 1250px) {
        .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "stage stage" "blue red"; }
        .stage { grid-area: stage; }
        .lu-blue { grid-area: blue; }
        .lu-red { grid-area: red; }
    }
    @media (max-width: 720px) {
        .bc { grid-template-columns: 1fr 1fr; }
        .bc-mid { grid-column: 1 / -1; grid-row: 1; border: none; border-bottom: 1px solid rgba(148,163,184,0.12); padding: 10px; }
        .bc-team { padding: 10px 12px; gap: 8px; }
        .bc-logo { width: 36px; height: 36px; font-size: 20px; border-radius: 11px; }
        .bc-name { font-size: 13px; }
        .bc-score { font-size: 32px; min-width: 24px; }
        .plays { grid-template-columns: 1fr; }
        .pc { flex-direction: row; flex-wrap: wrap; text-align: left; align-items: center; padding: 14px; gap: 4px 12px; }
        .pc-ico { width: 46px; height: 46px; margin: 0; }
        .pc-ico :global(svg) { width: 22px; height: 22px; }
        .pc-name { flex: 1; }
        .pc-blurb { flex-basis: 100%; min-height: 0; }
        .pc-stat { justify-content: flex-start; }
        .pc-key { display: none; }
        .ch-keys { display: none; }
        .grid { grid-template-columns: 1fr; grid-template-areas: "stage" "blue" "red"; }
        .cl-num { font-size: 40px; }
        .cl-token { width: 54px; height: 54px; }
        .dr { grid-template-columns: 28px 1fr 64px 1fr 28px; gap: 5px; }
    }
</style>
