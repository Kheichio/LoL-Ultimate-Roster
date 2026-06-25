<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab } from '../../stores/ui.js';
    import { getDB, LEGACY_TIERS, getEffectiveStats, getEffectiveRating, getEra } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    let phase = 'lobby';
    let floor = 0;
    let currentEnemy = null;
    let matchLog = [];
    let playerScore = 0;
    let cpuScore = 0;
    let towerBuffs = [];
    let upgradeChoices = [];
    let totalBEEarned = 0;

    const PLAYS = [
        { id: 'mec', label: 'Mechanical', stat: 'mec', icon: '⚡' },
        { id: 'tmf', label: 'Teamfight', stat: 'tmf', icon: '🔥' },
        { id: 'map', label: 'Macro', stat: 'map', icon: '🗺️' },
        { id: 'frm', label: 'Form', stat: 'frm', icon: '📈' },
        { id: 'cmp', label: 'Composure', stat: 'cmp', icon: '🧊' },
    ];
    let roundPlays = [];
    function rollRoundPlays() { roundPlays = [...PLAYS].sort(() => Math.random() - 0.5).slice(0, 3); }

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: coachBonus = (() => { const c=$squad.COACH; if(!c) return 0; return c.rating>=98?5:c.rating>=94?4:c.rating>=90?3:c.rating>=85?2:1; })();
    $: regionChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.region)).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: eraChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>getEra(c.year))).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: teamChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); return !nl.length||new Set(nl.map(c=>c.team)).size===1?2:0; })();
    $: legacyBonus = (()=>{ const c=starters.filter(c=>LEGACY_TIERS.includes(c.quality)).length; return c>=4?2:c>=2?1:0; })();
    $: chemBonus = regionChem + eraChem + teamChem + coachBonus + legacyBonus;
    $: totalPower = squadReady ? avgRating + chemBonus + towerBuff : 0;
    $: towerBuff = towerBuffs.reduce((s, b) => s + (b.powerBonus || 0), 0);

    $: myStatAvgs = squadReady ? (() => {
        try {
            const r = {}; ['mec','tmf','map','frm','cmp'].forEach(s => {
                const buffBonus = towerBuffs.filter(b => b.stat === s || b.stat === 'all').reduce((sum, b) => sum + (b.statBonus || 0), 0);
                r[s] = Math.round(starters.reduce((sum, c) => sum + (getEffectiveStats(c)[s]||0), 0) / starters.length) + buffBonus;
            }); return r;
        } catch(e) { return {}; }
    })() : {};
    $: cpuStatAvgs = currentEnemy ? (() => {
        try { const cards = Object.values(currentEnemy.cards||{}).filter(c=>c&&c.stats); const r={}; ['mec','tmf','map','frm','cmp'].forEach(s=>{ r[s]=cards.length>0?Math.round(cards.reduce((sum,c)=>sum+(c.stats[s]||0),0)/cards.length):0; }); return r; } catch(e) { return {}; }
    })() : {};

    $: bestFloor = $trackStats.towerHighestFloor || 0;

    function generateEnemy(fl) {
        const db = getDB(); if (!db) return null;
        const pool = db.filter(p => p.role !== 'COACH');
        const baseRating = Math.min(99, 65 + fl * 1.5);
        const cpuBonus = Math.floor(fl / 3);
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const team = {}; const used = new Set();
        roles.forEach(role => {
            let rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= baseRating - 10);
            if (rp.length < 3) rp = pool.filter(p => p.role === role && !used.has(p.id));
            rp.sort((a,b) => b.rating - a.rating);
            const pick = rp[Math.floor(Math.random() * Math.max(1, Math.min(rp.length, 8)))];
            if (pick) { team[role] = pick; used.add(pick.id); }
        });
        const cards = Object.values(team);
        const avg = (cards.length > 0 ? Math.round(cards.reduce((s,c) => s + c.rating, 0) / cards.length) : baseRating) + cpuBonus;
        const names = ['Floor Guardians','Shadow Sentinels','Iron Wardens','Crystal Defenders','Dark Protectors','Storm Keepers','Frost Watchers','Thunder Lords','Crimson Guard','Neon Enforcers'];
        return { name: names[fl % names.length], cards: team, avgRating: avg };
    }

    function generateUpgrades(fl) {
        const isMilestone = fl > 0 && fl % 10 === 0;
        const stats = ['mec','tmf','map','frm','cmp'];
        const choices = [];
        const pool = isMilestone ? [
            { label: '+5 All Stats', stat: 'all', statBonus: 5, powerBonus: 0, tier: 'epic' },
            { label: '+8 Power', stat: null, statBonus: 0, powerBonus: 8, tier: 'epic' },
            { label: '+10 to Random Stat', stat: stats[Math.floor(Math.random()*stats.length)], statBonus: 10, powerBonus: 0, tier: 'epic' },
            { label: '+3 All Stats +3 Power', stat: 'all', statBonus: 3, powerBonus: 3, tier: 'epic' },
        ] : [
            { label: '+2 All Stats', stat: 'all', statBonus: 2, powerBonus: 0, tier: 'common' },
            { label: '+3 Power', stat: null, statBonus: 0, powerBonus: 3, tier: 'common' },
            ...stats.map(s => ({ label: `+5 ${s.toUpperCase()}`, stat: s, statBonus: 5, powerBonus: 0, tier: 'common' })),
            { label: '+1 All Stats +2 Power', stat: 'all', statBonus: 1, powerBonus: 2, tier: 'rare' },
        ];
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3);
    }

    function startTower() {
        if (!squadReady) { showToast('Fill all 5 positions.', 'error'); return; }
        floor = 0; towerBuffs = []; totalBEEarned = 0;
        nextFloor();
    }

    function nextFloor() {
        floor++;
        currentEnemy = generateEnemy(floor);
        playerScore = 0; cpuScore = 0; matchLog = [];
        rollRoundPlays();
        phase = 'match';
    }

    function pickPlay(play) {
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const myVal = myStatAvgs[play.stat] || 0;
        const cpuCards = Object.values(currentEnemy.cards);
        const cpuVal = cpuCards.length > 0 ? Math.round(cpuCards.reduce((s,c) => s + (c.stats[cpuPlay.stat]||0), 0) / cpuCards.length) : 0;
        const myFinal = totalPower + (myVal - cpuVal) + Math.floor(Math.random() * 11) - 5;
        const cpuFinal = currentEnemy.avgRating + Math.floor(Math.random() * 11) - 5;
        const won = myFinal >= cpuFinal;
        if (won) playerScore++; else cpuScore++;
        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won }];
        rollRoundPlays();
        if (playerScore >= 2 || cpuScore >= 2) {
            if (playerScore >= 2) {
                playSound('win');
                upgradeChoices = generateUpgrades(floor);
                if (floor % 10 === 0) {
                    const reward = Math.min(5000, 300 + Math.floor((floor / 10 - 1)) * 300);
                    totalBEEarned += reward;
                    blueEssence.update(v => v + reward);
                    showToast(`Floor ${floor} cleared! +${reward} BE`, 'success');
                }
                if (floor > bestFloor) trackStats.update(s => ({ ...s, towerHighestFloor: floor }));
                saveGame();
                phase = 'upgrade';
            } else {
                playSound('lose');
                if (floor > bestFloor) trackStats.update(s => ({ ...s, towerHighestFloor: floor - 1 }));
                saveGame();
                phase = 'dead';
            }
        }
    }

    function pickUpgrade(upgrade) {
        towerBuffs = [...towerBuffs, upgrade];
        showToast(`${upgrade.label} applied!`, 'success');
        nextFloor();
    }

    function endRun() { phase = 'lobby'; }
</script>

<section class="tower">
    {#if phase === 'lobby'}
        <div class="tw-head">
            <h2 class="tw-title">Infinity Tower</h2>
            <p class="tw-desc">Endless floors of increasing difficulty. How high can you climb?</p>
        </div>
        <div class="tw-hero">
            <div class="tw-best">
                <span class="twb-num">{bestFloor}</span>
                <span class="twb-label">Best Floor</span>
            </div>
            {#if squadReady}
                <button class="tw-start" on:click={startTower}>Begin Climb</button>
            {:else}
                <p class="tw-warn">Fill all 5 squad positions to enter.</p>
            {/if}
            <button class="tw-back" on:click={() => switchTab('tournament')}>← Back to Play</button>
        </div>

    {:else if phase === 'match' && currentEnemy}
        <div class="tw-floor-bar">
            <span class="tw-floor">Floor {floor}</span>
            <span class="tw-buffs">{towerBuffs.length} buffs · +{towerBuff} PWR</span>
            <span class="tw-earned">{totalBEEarned} BE earned</span>
        </div>
        <div class="match-header">
            <div class="mh-score"><span class="mh-blue">{playerScore}</span><span class="mh-sep">—</span><span class="mh-red">{cpuScore}</span></div>
        </div>
        <div class="match-layout">
            <div class="team-block">
                <div class="arena-label arena-label-blue">You ({totalPower})</div>
                <div class="arena-grid-2x3">{#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}{#each pair as role}<div class="arena-cell">{#if $squad[role]}<Card card={$squad[role]} mini={true} />{:else}<div class="arena-empty">{role}</div>{/if}</div>{/each}{/each}</div>
            </div>
            <div class="arena-center">
                <div class="stat-compare"><div class="sc-title">Available Plays</div>
                    {#each roundPlays as play}{@const myVal=myStatAvgs[play.stat]||0}{@const cpuVal=cpuStatAvgs[play.stat]||0}{@const diff=myVal-cpuVal}
                        <div class="sc-row"><span class="sc-val sc-val-blue">{myVal}</span><div class="sc-bar-wrap"><div class="sc-label">{play.icon} {play.label}</div><div class="sc-bar"><div class="sc-fill-blue" style="width:{Math.min(100,(myVal/Math.max(myVal,cpuVal,1))*50)}%"></div><div class="sc-fill-red" style="width:{Math.min(100,(cpuVal/Math.max(myVal,cpuVal,1))*50)}%;margin-left:auto;"></div></div><div class="sc-diff" class:sc-diff-pos={diff>0} class:sc-diff-neg={diff<0}>{diff>0?'+':''}{diff}</div></div><span class="sc-val sc-val-red">{cpuVal}</span></div>
                    {/each}
                </div>
                {#if matchLog.length > 0}<div class="log-list">{#each matchLog as log}<div class="log-row" class:log-w={log.won} class:log-l={!log.won}><span class="log-result">{log.won?'✓':'✗'}</span><span class="log-detail">{log.myPlay.icon} {log.myVal} vs {log.cpuPlay.icon} {log.cpuVal}</span></div>{/each}</div>{/if}
                {#if playerScore < 2 && cpuScore < 2}
                    <div class="play-picker"><div class="play-label">Choose Play</div>
                        <div class="play-grid">{#each roundPlays as play}{@const edge=(myStatAvgs[play.stat]||0)-(cpuStatAvgs[play.stat]||0)}<button class="play-btn" on:click={() => pickPlay(play)}><span class="pb-icon">{play.icon}</span><span class="pb-name">{play.label}</span><span class="pb-edge" class:pb-edge-pos={edge>0} class:pb-edge-neg={edge<0}>{edge>0?'+':''}{edge}</span></button>{/each}</div>
                    </div>
                {/if}
            </div>
            <div class="team-block">
                <div class="arena-label arena-label-red">{currentEnemy.name} ({currentEnemy.avgRating})</div>
                <div class="arena-grid-2x3">{#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}{#each pair as role}<div class="arena-cell">{#if currentEnemy.cards[role]}<Card card={currentEnemy.cards[role]} mini={true} />{:else if role!=='COACH'}<div class="arena-empty">{role}</div>{:else}<div class="arena-empty-sm"></div>{/if}</div>{/each}{/each}</div>
            </div>
        </div>

    {:else if phase === 'upgrade'}
        <div class="tw-floor-bar">
            <span class="tw-floor">Floor {floor} Cleared!</span>
            <span class="tw-buffs">{towerBuffs.length} buffs</span>
        </div>
        <div class="upg-panel">
            <h3 class="upg-title">Choose an Upgrade</h3>
            <div class="upg-grid">
                {#each upgradeChoices as u}
                    <button class="upg-card" class:upg-epic={u.tier==='epic'} on:click={() => pickUpgrade(u)}>
                        <span class="upg-label">{u.label}</span>
                        {#if u.tier === 'epic'}<span class="upg-tier">EPIC</span>{/if}
                    </button>
                {/each}
            </div>
        </div>

    {:else if phase === 'dead'}
        <div class="result-card result-lose">
            <div class="result-icon" style="font-size:48px;">💀</div>
            <h2 class="result-title rt-lose">Tower Run Over</h2>
            <p class="result-sub">Reached Floor {floor} · {towerBuffs.length} upgrades collected</p>
            <p class="result-reward">{totalBEEarned} BE earned this run</p>
            <button class="tw-back" style="margin-top:20px;" on:click={endRun}>Back to Lobby</button>
        </div>
    {/if}
</section>

<style>
    .tower { max-width: 1600px; margin: 0 auto; padding-bottom: 40px; }
    .tw-head { margin-bottom: 20px; }
    .tw-title { font-size: 22px; font-weight: 900; color: #f87171; }
    .tw-desc { font-size: 12px; color: #64748b; margin-top: 3px; }
    .tw-hero { text-align: center; padding: 40px 24px; background: rgba(12,16,28,0.5); border: 1px solid rgba(239,68,68,0.12); border-radius: 20px; }
    .tw-best { margin-bottom: 20px; }
    .twb-num { font-size: 48px; font-weight: 900; color: #f87171; display: block; }
    .twb-label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; }
    .tw-start { padding: 14px 40px; border-radius: 12px; background: linear-gradient(135deg, #dc2626, #ef4444); color: white; font-weight: 900; font-size: 14px; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(239,68,68,0.3); transition: all 0.15s; }
    .tw-start:hover { box-shadow: 0 6px 20px rgba(239,68,68,0.45); transform: translateY(-1px); }
    .tw-warn { font-size: 12px; color: #f87171; font-weight: 700; }
    .tw-back { display: block; margin: 12px auto 0; padding: 8px 20px; border-radius: 10px; background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3); color: #94a3b8; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.12s; }
    .tw-back:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }

    .tw-floor-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-radius: 12px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.12); margin-bottom: 16px; }
    .tw-floor { font-size: 16px; font-weight: 900; color: #f87171; }
    .tw-buffs { font-size: 11px; color: #94a3b8; font-weight: 700; }
    .tw-earned { font-size: 11px; color: #60a5fa; font-weight: 700; }

    /* Reuse match layout styles */
    .match-header { text-align: center; margin-bottom: 16px; }
    .mh-score { display: flex; justify-content: center; gap: 16px; }
    .mh-blue { font-size: 24px; font-weight: 900; color: #60a5fa; } .mh-red { font-size: 24px; font-weight: 900; color: #f87171; } .mh-sep { font-size: 24px; font-weight: 900; color: #334155; }
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
    .sc-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; text-align: center; margin-bottom: 12px; }
    .sc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .sc-val { font-size: 14px; font-weight: 900; width: 32px; text-align: center; } .sc-val-blue { color: #60a5fa; } .sc-val-red { color: #f87171; }
    .sc-bar-wrap { flex: 1; text-align: center; } .sc-label { font-size: 10px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
    .sc-bar { display: flex; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .sc-fill-blue { background: linear-gradient(90deg, #1e40af, #3b82f6); border-radius: 4px 0 0 4px; }
    .sc-fill-red { background: linear-gradient(90deg, #ef4444, #991b1b); border-radius: 0 4px 4px 0; }
    .sc-diff { font-size: 11px; font-weight: 900; color: #64748b; margin-top: 2px; } .sc-diff-pos { color: #34d399; } .sc-diff-neg { color: #f87171; }
    .log-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
    .log-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; border-radius: 10px; font-size: 12px; background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15); }
    .log-w { border-color: rgba(16,185,129,0.15); } .log-l { border-color: rgba(239,68,68,0.15); }
    .log-result { font-weight: 900; } .log-w .log-result { color: #34d399; } .log-l .log-result { color: #f87171; }
    .log-detail { color: #64748b; font-size: 11px; }
    .play-picker { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 16px; padding: 20px; }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 14px; }
    .play-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .play-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 12px; border-radius: 14px; cursor: pointer; background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3); transition: all 0.12s; }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(59,130,246,0.2); transform: scale(1.03); }
    .pb-icon { font-size: 24px; } .pb-name { font-size: 12px; font-weight: 900; color: #e2e8f0; }
    .pb-edge { font-size: 11px; font-weight: 900; color: #64748b; } .pb-edge-pos { color: #34d399; } .pb-edge-neg { color: #f87171; }

    /* Upgrade panel */
    .upg-panel { text-align: center; padding: 40px 24px; }
    .upg-title { font-size: 18px; font-weight: 900; color: #e2e8f0; margin-bottom: 20px; }
    .upg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; max-width: 600px; margin: 0 auto; }
    @media (max-width: 600px) { .upg-grid { grid-template-columns: 1fr; } }
    .upg-card {
        padding: 28px 16px; border-radius: 16px; cursor: pointer;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        transition: all 0.15s; display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .upg-card:hover { border-color: rgba(59,130,246,0.3); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .upg-epic { border-color: rgba(251,191,36,0.3) !important; background: rgba(251,191,36,0.04); }
    .upg-epic:hover { border-color: rgba(251,191,36,0.5) !important; box-shadow: 0 8px 24px rgba(251,191,36,0.1); }
    .upg-label { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .upg-tier { font-size: 9px; font-weight: 900; color: #fbbf24; text-transform: uppercase; letter-spacing: 2px; }

    /* Results */
    .result-card { text-align: center; padding: 40px 24px; border-radius: 20px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); }
    .result-lose { border-color: rgba(239,68,68,0.15); background: rgba(127,29,29,0.06); }
    .result-icon { margin-bottom: 12px; }
    .result-title { font-size: 24px; font-weight: 900; margin-bottom: 8px; } .rt-lose { color: #f87171; }
    .result-sub { font-size: 12px; color: #94a3b8; }
    .result-reward { font-size: 18px; font-weight: 900; color: #60a5fa; margin-top: 8px; }
</style>
