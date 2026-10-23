<script>
    // The ORIGINAL match screen, preserved for Legacy Mode. Markup and styles are the
    // pre-1.7.7 Tournament match phase moved here verbatim — same 2x3 card grids, same power
    // box, same "Net" numbers — so Legacy plays exactly the way the game used to look.
    // It takes the same props as MatchArena so a parent can swap one for the other. There is
    // no reveal, so `revealed` fires straight after every pick.
    import { createEventDispatcher } from 'svelte';
    import Card from '../card/Card.svelte';

    export let title = 'Match';
    export let subtitle = '';
    export let blue;
    export let red;
    export let plays = [];
    export let scoreBlue = 0;
    export let scoreRed = 0;
    export let winsNeeded = 2;
    export let log = [];
    export let tactics = 0;
    // Accepted for prop parity with MatchArena; the original screen never showed them.
    export let accent = '';
    export let icon = '';
    export let allPlays = [];
    export let chips = [];
    $: void (accent, icon, allPlays, chips);

    const dispatch = createEventDispatcher();
    const LEGACY_ICONS = { mec: '⚡', tmf: '🔥', map: '🗺️', frm: '📈', cmp: '🧊' };
    const iconFor = (p) => p.icon || LEGACY_ICONS[p.stat] || '🎯';

    $: myStatAvgs = (blue && blue.stats) || {};
    $: cpuStatAvgs = (red && red.stats) || {};
    $: powerDiff = blue.power - red.power;
    $: byRole = (side) => Object.fromEntries((side.lineup || []).map(p => [p.role, p.card]));
    $: blueCards = byRole(blue);
    $: redCards = byRole(red);

    function pick(play) {
        dispatch('pick', play);
        dispatch('revealed');
    }
</script>

<div class="match-header">
    <div class="mh-label">{title}{subtitle ? ` — ${subtitle}` : ''}</div>
    <div class="mh-score"><span class="mh-blue">{scoreBlue}</span><span class="mh-sep">—</span><span class="mh-red">{scoreRed}</span></div>
</div>
<div class="match-layout">
    <div class="team-block">
        <div class="arena-label arena-label-blue">{blue.name} ({blue.power})</div>
        <div class="arena-grid-2x3">
            {#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}{#each pair as role}<div class="arena-cell">{#if blueCards[role]}<Card card={blueCards[role]} mini={true} />{:else if role !== 'COACH'}<div class="arena-empty">{role}</div>{:else}<div class="arena-empty-sm"></div>{/if}</div>{/each}{/each}
        </div>
    </div>
    <div class="arena-center">
        <div class="power-compare">
            <span class="pc-side pc-blue">{blue.power}</span>
            <div class="pc-center">
                <div class="pc-label">Base Power</div>
                <div class="pc-diff" class:pc-pos={powerDiff > 0} class:pc-neg={powerDiff < 0} class:pc-even={powerDiff === 0}>
                    {powerDiff > 0 ? '+' : ''}{powerDiff}
                </div>
                <div class="pc-note">Net = Power + Stat · Luck ±5 each</div>
            </div>
            <span class="pc-side pc-red">{red.power}</span>
        </div>

        <div class="stat-compare">
            <div class="sc-title">Available Plays {#if tactics > 0}<span class="tactics-tag">🧠 Tactics +{tactics}</span>{/if}</div>
            {#each plays as play}{@const myVal = myStatAvgs[play.stat]||0}{@const cpuVal = cpuStatAvgs[play.stat]||0}{@const diff = myVal - cpuVal}
                <div class="sc-row"><span class="sc-val sc-val-blue">{myVal}</span><div class="sc-bar-wrap"><div class="sc-label">{iconFor(play)} {play.label}</div><div class="sc-bar"><div class="sc-fill-blue" style="width:{Math.min(100,(myVal/Math.max(myVal,cpuVal,1))*50)}%"></div><div class="sc-fill-red" style="width:{Math.min(100,(cpuVal/Math.max(myVal,cpuVal,1))*50)}%;margin-left:auto;"></div></div><div class="sc-diff" class:sc-diff-pos={diff>0} class:sc-diff-neg={diff<0}>{diff>0?'+':''}{diff} stat</div></div><span class="sc-val sc-val-red">{cpuVal}</span></div>
            {/each}
        </div>
        {#if log.length > 0}
            <div class="log-list">
                {#each log as entry}
                    <div class="log-row" class:log-w={entry.won} class:log-l={!entry.won}>
                        <span class="log-result">{entry.won?'✓':'✗'}</span>
                        <div class="log-breakdown">
                            <div class="log-main">{iconFor(entry.myPlay)} <strong>{entry.myVal}</strong> vs {iconFor(entry.cpuPlay)} <strong>{entry.cpuVal}</strong></div>
                            <div class="log-detail-row">
                                <span class="log-calc">{entry.myBase}{entry.statEdge >= 0 ? '+' : ''}{entry.statEdge}{entry.myRoll >= 0 ? '+' : ''}{entry.myRoll}</span>
                                <span class="log-vs">vs</span>
                                <span class="log-calc">{entry.cpuBase}{entry.cpuRoll >= 0 ? '+' : ''}{entry.cpuRoll}</span>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
        {#if scoreBlue < winsNeeded && scoreRed < winsNeeded}
            <div class="play-picker"><div class="play-label">Choose Your Play (3 of 5)</div>
                <div class="play-grid">{#each plays as play}{@const edge = (myStatAvgs[play.stat]||0)-(cpuStatAvgs[play.stat]||0)}{@const net = powerDiff + edge}<button class="play-btn" on:click={() => pick(play)}><span class="pb-icon">{iconFor(play)}</span><span class="pb-name">{play.label}</span><span class="pb-stat" class:pb-edge-pos={edge>0} class:pb-edge-neg={edge<0}>Stat {edge>0?'+':''}{edge}</span><span class="pb-net" class:pb-edge-pos={net>0} class:pb-edge-neg={net<0}>Net {net>0?'+':''}{net}</span></button>{/each}</div>
            </div>
        {/if}
    </div>
    <div class="team-block">
        <div class="arena-label arena-label-red">{red.name} ({red.power})</div>
        <div class="arena-grid-2x3">
            {#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}{#each pair as role}<div class="arena-cell">{#if redCards[role]}<Card card={redCards[role]} mini={true} />{:else if role!=='COACH'}<div class="arena-empty">{role}</div>{:else}<div class="arena-empty-sm"></div>{/if}</div>{/each}{/each}
        </div>
    </div>
</div>

<style>
    .match-header { text-align: center; margin-bottom: 20px; }
    .mh-label { font-size: 12px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
    .mh-score { display: flex; justify-content: center; gap: 16px; margin-top: 8px; }
    .mh-blue { font-size: 24px; font-weight: 900; color: #60a5fa; }
    .mh-red { font-size: 24px; font-weight: 900; color: #f87171; }
    .mh-sep { font-size: 24px; font-weight: 900; color: #334155; }

    .match-layout { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
    @media (max-width: 1400px) { .match-layout { grid-template-columns: 1fr; } .team-block { display: none; } }
    .team-block { display: flex; flex-direction: column; gap: 6px; }
    .arena-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; padding: 8px 12px; border-radius: 10px; text-align: center; }
    .arena-label-blue { color: #93c5fd; background: rgba(30,58,138,0.2); border: 1px solid rgba(59,130,246,0.15); }
    .arena-label-red { color: #fca5a5; background: rgba(127,29,29,0.2); border: 1px solid rgba(239,68,68,0.15); }
    .arena-grid-2x3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .arena-cell { display: flex; justify-content: center; }
    .arena-empty { width: 180px; height: 80px; border-radius: 12px; background: rgba(15,23,42,0.3); border: 1px dashed rgba(51,65,85,0.2); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #1e293b; }
    .arena-empty-sm { width: 180px; height: 40px; }
    .arena-center { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    .stat-compare { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 14px; padding: 16px; }
    .sc-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; text-align: center; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .tactics-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 6px; background: rgba(147,51,234,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; font-size: 9px; font-weight: 900; letter-spacing: 0; text-transform: none; }
    .sc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .sc-val { font-size: 14px; font-weight: 900; width: 32px; text-align: center; } .sc-val-blue { color: #60a5fa; } .sc-val-red { color: #f87171; }
    .sc-bar-wrap { flex: 1; text-align: center; }
    .sc-label { font-size: 10px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
    .sc-bar { display: flex; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .sc-fill-blue { background: linear-gradient(90deg, #1e40af, #3b82f6); border-radius: 4px 0 0 4px; }
    .sc-fill-red { background: linear-gradient(90deg, #ef4444, #991b1b); border-radius: 0 4px 4px 0; }
    .sc-diff { font-size: 11px; font-weight: 900; color: #64748b; margin-top: 2px; } .sc-diff-pos { color: #34d399; } .sc-diff-neg { color: #f87171; }

    .power-compare { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px; padding: 12px 16px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.15); }
    .pc-side { font-size: 22px; font-weight: 900; min-width: 40px; text-align: center; }
    .pc-blue { color: #60a5fa; } .pc-red { color: #f87171; }
    .pc-center { text-align: center; }
    .pc-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    .pc-diff { font-size: 18px; font-weight: 900; }
    .pc-pos { color: #34d399; } .pc-neg { color: #f87171; } .pc-even { color: #64748b; }
    .pc-note { font-size: 8px; color: #334155; margin-top: 2px; }

    .log-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .log-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; font-size: 12px; background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15); }
    .log-w { border-color: rgba(16,185,129,0.15); } .log-l { border-color: rgba(239,68,68,0.15); }
    .log-result { font-weight: 900; font-size: 14px; flex-shrink: 0; } .log-w .log-result { color: #34d399; } .log-l .log-result { color: #f87171; }
    .log-breakdown { flex: 1; }
    .log-main { font-size: 12px; font-weight: 700; color: #e2e8f0; }
    .log-detail-row { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #475569; font-family: monospace; margin-top: 2px; }
    .log-calc { color: #64748b; }
    .log-vs { color: #334155; }

    .play-picker { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 16px; padding: 24px; }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 16px; }
    .play-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .play-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 12px; border-radius: 14px; cursor: pointer; background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3); transition: all 0.12s; }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(59,130,246,0.2); transform: scale(1.03); }
    .pb-icon { font-size: 26px; } .pb-name { font-size: 12px; font-weight: 900; color: #e2e8f0; }
    .pb-stat { font-size: 10px; font-weight: 700; color: #64748b; }
    .pb-net { font-size: 12px; font-weight: 900; color: #64748b; margin-top: 2px; }
    .pb-edge-pos { color: #34d399; } .pb-edge-neg { color: #f87171; }
</style>
