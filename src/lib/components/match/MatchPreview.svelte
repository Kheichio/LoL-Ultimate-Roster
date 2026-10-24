<script>
    // The pre-match screen between rounds of a tournament: where you are in the bracket, who
    // is next, both lineups face to face and your real chance of taking the match.
    import { createEventDispatcher } from 'svelte';
    import Icon from '../ui/Icon.svelte';
    import Lineup from './Lineup.svelte';
    import CardViewToggle from './CardViewToggle.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { seriesWinChance } from './matchMath.js';

    export let title = '';
    export let subtitle = '';
    export let accent = '#6366f1';
    export let icon = 'trophy';
    /** [{ name, power, state: 'won' | 'lost' | 'current' | 'next' }] */
    export let rounds = [];
    /** Optional stage path above the rounds (Golden Road): [{ icon, label, state }] */
    export let stages = [];
    export let blue;
    export let red;
    export let allPlays = [];
    export let winsNeeded = 2;
    export let startLabel = 'Start match';

    const dispatch = createEventDispatcher();

    $: rs = (red && red.stats) || {};
    $: chance = seriesWinChance({
        myPower: blue.power, cpuPower: red.power, myStats: blue.stats || {},
        cpuStatPool: allPlays.map(p => rs[p.stat] || 0), allStats: allPlays.map(p => p.stat),
        offered: [], scoreBlue: 0, scoreRed: 0, winsNeeded,
    });
    // 100% / 0% only for a genuinely certain outcome.
    $: pct = chance >= 1 ? 100 : chance <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(chance * 100)));
    $: verdict = pct >= 80 ? 'Heavy favourite' : pct >= 60 ? 'Favourite' : pct >= 40 ? 'Coin flip' : pct >= 20 ? 'Underdog' : 'Long shot';
</script>

<div class="mp" style="--acc: {accent};">
    <header class="mp-head">
        <span class="mp-emblem"><Icon name={icon} size={26} /></span>
        <div>
            <span class="mp-kicker">{subtitle}</span>
            <h2 class="mp-title">{title}</h2>
        </div>
    </header>

    {#if stages.length}
        <ol class="stages">
            {#each stages as s}
                <li class="stg stg-{s.state}"><span class="stg-dot"><Icon name={s.state === 'won' ? 'check' : s.icon} size={14} stroke={2.2} /></span><span class="stg-lbl">{s.label}</span></li>
            {/each}
        </ol>
    {/if}

    <ol class="road" style="--n: {rounds.length};">
        {#each rounds as r, i}
            <li class="rd rd-{r.state}">
                <span class="rd-node">{#if r.state === 'won'}<Icon name="check" size={14} stroke={3} />{:else if r.state === 'lost'}<Icon name="skull" size={14} />{:else}{i + 1}{/if}</span>
                <span class="rd-name">{r.state === 'next' ? 'TBD' : r.name}</span>
                <span class="rd-pw">{r.state === 'next' ? '' : `${r.power} pwr`}</span>
            </li>
        {/each}
    </ol>

    <div class="vs">
        <section class="side side-b">
            <div class="side-head">
                <span class="sh-logo">{blue.logo || '🛡️'}</span>
                <span class="sh-tt"><span class="sh-name">{blue.name}</span><span class="sh-pw"><Icon name="bolt" size={11} stroke={2.4} /> {blue.power} power</span></span>
                <span class="sh-toggle"><CardViewToggle /></span>
            </div>
            <Lineup lineup={blue.lineup} side="blue" />
        </section>

        <div class="mid">
            <span class="vs-badge">VS</span>
            <div class="odds">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle class="o-bg" cx="60" cy="60" r="50" />
                    <circle class="o-fg" cx="60" cy="60" r="50" style="stroke-dasharray: {pct * 3.1416} 999;" />
                </svg>
                <span class="o-n">{pct}%</span>
                <span class="o-l">to win</span>
            </div>
            <span class="verdict">{verdict}</span>
            <span class="bo">Best of {winsNeeded * 2 - 1}</span>
            <button class="start" on:click={() => dispatch('start')} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>
                <Icon name="play" size={16} stroke={2.4} /> {startLabel}
            </button>
        </div>

        <section class="side side-r">
            <div class="side-head side-head-r">
                <span class="sh-tt sh-tt-r"><span class="sh-name">{red.name}</span><span class="sh-pw">{red.power} power <Icon name="bolt" size={11} stroke={2.4} /></span></span>
                <span class="sh-logo sh-logo-r">{red.logo || '⚔️'}</span>
            </div>
            <Lineup lineup={red.lineup} side="red" />
        </section>
    </div>
</div>

<style>
    .mp { display: flex; flex-direction: column; gap: 18px; }
    .mp-head { display: flex; align-items: center; gap: 14px; }
    .mp-emblem { width: 54px; height: 54px; border-radius: 17px; display: flex; align-items: center; justify-content: center; color: #fff; background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--acc) 85%, #fff), color-mix(in srgb, var(--acc) 50%, #000)); box-shadow: 0 0 26px color-mix(in srgb, var(--acc) 45%, transparent); }
    .mp-kicker { font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: var(--acc); }
    .mp-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; line-height: 1.05; }

    /* Golden Road stages */
    .stages { list-style: none; display: flex; gap: 6px; flex-wrap: wrap; }
    .stg { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 5px; border-radius: 100px; font-size: 11.5px; font-weight: 800; color: #94a3b8; background: rgba(15,23,42,0.7); border: 1px solid rgba(71,85,105,0.3); }
    .stg-dot { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(30,41,59,0.9); color: #64748b; }
    .stg-won { color: #6ee7b7; border-color: rgba(52,211,153,0.35); }
    .stg-won .stg-dot { background: #10b981; color: #052e16; }
    .stg-current { color: #fde68a; border-color: rgba(251,191,36,0.5); box-shadow: 0 0 16px rgba(251,191,36,0.18); }
    .stg-current .stg-dot { background: linear-gradient(140deg, #fde68a, #f59e0b); color: #1c1405; }

    /* Round road */
    .road { list-style: none; position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 6px; padding: 14px; border-radius: 20px; background: rgba(10,14,26,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .road::before { content: ''; position: absolute; left: calc(14px + (100% - 28px) / var(--n) / 2); right: calc(14px + (100% - 28px) / var(--n) / 2); top: 31px; height: 2px; background: rgba(51,65,85,0.7); }
    .rd { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; min-width: 0; }
    .rd-node { position: relative; z-index: 1; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; color: #64748b; background: #111827; border: 2px solid #334155; }
    .rd-name { font-size: 11.5px; font-weight: 800; color: #94a3b8; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rd-pw { font-size: 10px; font-weight: 700; color: #475569; min-height: 13px; }
    .rd-won .rd-node { background: #10b981; border-color: #34d399; color: #052e16; }
    .rd-won .rd-name { color: #6ee7b7; }
    .rd-lost .rd-node { background: #7f1d1d; border-color: #f87171; color: #fecaca; }
    .rd-current .rd-node { background: var(--acc); border-color: color-mix(in srgb, var(--acc) 60%, #fff); color: #fff; box-shadow: 0 0 0 5px color-mix(in srgb, var(--acc) 25%, transparent), 0 0 20px var(--acc); animation: nodePulse 1.8s ease-in-out infinite; }
    .rd-current .rd-name { color: #fff; }
    .rd-current .rd-pw { color: #fca5a5; }
    @keyframes nodePulse { 50% { box-shadow: 0 0 0 9px color-mix(in srgb, var(--acc) 10%, transparent), 0 0 26px var(--acc); } }

    /* Face-off */
    .vs { display: grid; grid-template-columns: minmax(0, 1fr) 230px minmax(0, 1fr); gap: 16px; align-items: start; }
    .side { --lineup-cols: 3; display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 22px; background: linear-gradient(180deg, rgba(30,64,175,0.14), rgba(10,14,26,0.6) 40%); border: 1px solid rgba(96,165,250,0.25); }
    .sh-toggle { margin-left: auto; }
    @media (max-width: 1180px) { .side { --lineup-cols: 2; } }
    .side-r { background: linear-gradient(180deg, rgba(153,27,27,0.14), rgba(10,14,26,0.6) 40%); border-color: rgba(248,113,113,0.25); }
    .side-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .side-head-r { justify-content: flex-end; }
    .sh-logo { width: 44px; height: 44px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 26px; background: rgba(2,6,23,0.6); border: 1px solid rgba(96,165,250,0.4); }
    .sh-logo-r { border-color: rgba(248,113,113,0.4); }
    .sh-tt { display: flex; flex-direction: column; min-width: 0; }
    .sh-tt-r { align-items: flex-end; text-align: right; }
    .sh-name { font-size: 16px; font-weight: 900; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sh-pw { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #93c5fd; }
    .side-r .sh-pw { color: #fca5a5; }

    .mid { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 24px; }
    .vs-badge { font-size: 24px; font-weight: 900; font-style: italic; color: #fff; padding: 12px 14px; border-radius: 50%; background: linear-gradient(135deg, #1d4ed8, #b91c1c); box-shadow: 0 0 30px rgba(129,140,248,0.4); }
    .odds { position: relative; width: 120px; height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 6px; }
    .odds svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .o-bg { fill: none; stroke: rgba(239,68,68,0.45); stroke-width: 9; }
    .o-fg { fill: none; stroke: #60a5fa; stroke-width: 9; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(96,165,250,0.7)); transition: stroke-dasharray 0.6s ease; }
    .o-n { position: relative; font-size: 28px; font-weight: 900; color: #fff; line-height: 1; }
    .o-l { position: relative; font-size: 9.5px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; }
    .verdict { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .bo { font-size: 11px; font-weight: 700; color: #64748b; }
    .start {
        position: relative; overflow: hidden; margin-top: 8px; width: 100%;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 15px 18px; border-radius: 16px; border: none; cursor: pointer;
        font-size: 15px; font-weight: 900; letter-spacing: 0.5px; color: #fff;
        background: linear-gradient(135deg, color-mix(in srgb, var(--acc) 80%, #fff), var(--acc) 50%, color-mix(in srgb, var(--acc) 70%, #000));
        box-shadow: 0 10px 28px color-mix(in srgb, var(--acc) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.3);
        animation: startPulse 2.2s ease-in-out infinite;
    }
    .start:hover { transform: translateY(-2px); }
    @keyframes startPulse { 50% { box-shadow: 0 10px 38px color-mix(in srgb, var(--acc) 65%, transparent), inset 0 1px 0 rgba(255,255,255,0.3); } }

    @media (max-width: 1000px) {
        .vs { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "mid mid" "b r"; }
        .mid { grid-area: mid; padding-top: 0; }
        .side-b { grid-area: b; }
        .side-r { grid-area: r; }
        .start { max-width: 320px; }
    }
    @media (max-width: 640px) {
        .vs { grid-template-columns: 1fr; grid-template-areas: "mid" "b" "r"; }
        .road { grid-template-columns: repeat(var(--n), 44px); overflow-x: auto; }
        .road::before { display: none; }
        .rd-name, .rd-pw { display: none; }
    }
</style>
