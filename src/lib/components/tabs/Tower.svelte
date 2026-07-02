<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, skills, grantXP, grantBPXP, grantBE, saveGame } from '../../stores/game.js';
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

    function saveTowerRun() {
        localStorage.setItem('lur_tower_run', JSON.stringify({ floor, towerBuffs, totalBEEarned }));
    }
    function loadTowerRun() {
        try {
            const raw = localStorage.getItem('lur_tower_run');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }
    function clearTowerRun() {
        localStorage.removeItem('lur_tower_run');
    }

    // Load saved run on mount
    const savedRun = loadTowerRun();
    if (savedRun && savedRun.floor > 0) {
        floor = savedRun.floor;
        towerBuffs = savedRun.towerBuffs || [];
        totalBEEarned = savedRun.totalBEEarned || 0;
        phase = 'lobby';
    }

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
    $: conditioningBonus = $skills.conditioning || 0;
    $: chemBonus = regionChem + eraChem + teamChem + coachBonus + legacyBonus + conditioningBonus;
    $: totalPower = squadReady ? avgRating + chemBonus + towerBuff : 0;
    $: towerBuff = buffSummary.power;

    $: buffSummary = (() => {
        const r = { power: 0, flat: {}, pct: {} };
        ['mec','tmf','map','frm','cmp'].forEach(s => { r.flat[s] = 0; r.pct[s] = 0; });
        towerBuffs.forEach(b => {
            r.power += b.powerBonus || 0;
            if (b.statBonus) { if (b.stat === 'all') ['mec','tmf','map','frm','cmp'].forEach(s => r.flat[s] += b.statBonus); else if (b.stat) r.flat[b.stat] += b.statBonus; }
            if (b.pctBonus) { if (b.stat === 'all') ['mec','tmf','map','frm','cmp'].forEach(s => r.pct[s] += b.pctBonus); else if (b.stat) r.pct[b.stat] += b.pctBonus; }
        });
        return r;
    })();

    $: baseStatAvgs = squadReady ? (() => {
        try {
            const r = {}; ['mec','tmf','map','frm','cmp'].forEach(s => {
                r[s] = Math.round(starters.reduce((sum, c) => sum + (getEffectiveStats(c)[s]||0), 0) / starters.length);
            }); return r;
        } catch(e) { return {}; }
    })() : {};

    $: tacticsLevel = $skills.tactics || 0;
    $: powerDiff = currentEnemy ? totalPower - (currentEnemy.avgRating || 0) : 0;
    $: myStatAvgs = squadReady ? (() => {
        try {
            const r = {}; ['mec','tmf','map','frm','cmp'].forEach(s => {
                const base = baseStatAvgs[s] || 0;
                const withFlat = base + (buffSummary.flat[s] || 0);
                const withPct = Math.round(withFlat * (1 + (buffSummary.pct[s] || 0) / 100));
                r[s] = withPct + tacticsLevel;
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

        // Floor 1 targets Gold tier (~79-83).
        // Slow ramp for the first 20 floors, then steeper.
        // No upper cap — stat boosts keep scaling past 99.
        const GOLD_FLOOR = 79;
        const baseRating = fl <= 1
            ? GOLD_FLOOR
            : fl <= 20
                ? GOLD_FLOOR + (fl - 1) * 1        // +1 per floor, floors 2-20 → 80-98
                : 98 + (fl - 20) * 2;              // +2 per floor above 20 → scales infinitely

        // Minimum card rating to draw from DB (clamp at 99 since DB doesn't go higher)
        const minCardRating = Math.min(99, Math.max(GOLD_FLOOR, baseRating - 6));

        // Stat boost applied on top of real card stats — this is what goes infinite
        const cpuStatBoost = fl <= 20
            ? Math.floor((fl - 1) / 3)             // tiny boost early (0–6)
            : Math.floor((fl - 20) * 1.5) + 6;    // accelerates after floor 20

        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const team = {}; const used = new Set();
        roles.forEach(role => {
            let rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= minCardRating);
            if (rp.length < 3) rp = pool.filter(p => p.role === role && !used.has(p.id)).sort((a,b) => b.rating - a.rating).slice(0, 8);
            rp.sort((a,b) => b.rating - a.rating);
            const pick = rp[Math.floor(Math.random() * Math.max(1, Math.min(rp.length, 5)))];
            if (pick) {
                const boosted = { ...pick, stats: { ...pick.stats } };
                for (const k in boosted.stats) boosted.stats[k] = (boosted.stats[k] || 0) + cpuStatBoost;
                team[role] = boosted;
                used.add(pick.id);
            }
        });
        const cards = Object.values(team);
        const cardAvg = cards.length > 0 ? Math.round(cards.reduce((s,c) => s + c.rating, 0) / cards.length) : baseRating;
        // avgRating drives the power comparison; also scales infinitely via the stat boost
        const avg = cardAvg + cpuStatBoost;
        const names = ['Floor Guardians','Shadow Sentinels','Iron Wardens','Crystal Defenders','Dark Protectors','Storm Keepers','Frost Watchers','Thunder Lords','Crimson Guard','Neon Enforcers'];
        return { name: names[fl % names.length], cards: team, avgRating: avg };
    }

    const STAT_NAMES = { mec: 'MEC', tmf: 'TMF', map: 'MAP', frm: 'FRM', cmp: 'CMP' };
    const STAT_ICONS = { mec: '⚡', tmf: '🔥', map: '🗺️', frm: '📈', cmp: '🧊' };

    function generateUpgrades(fl) {
        const isMilestone = fl > 0 && fl % 10 === 0;
        const stats = ['mec','tmf','map','frm','cmp'];
        const rs = () => stats[Math.floor(Math.random() * stats.length)];

        const commonPool = [
            { icon: '🛡️', label: '+1 All Stats', desc: 'Small boost to everything', stat: 'all', statBonus: 1, powerBonus: 0, pctBonus: 0, tier: 'common' },
            { icon: '⚔️', label: '+2 Power', desc: 'Flat power boost', stat: null, statBonus: 0, powerBonus: 2, pctBonus: 0, tier: 'common' },
            ...stats.map(s => ({ icon: STAT_ICONS[s], label: `+3 ${STAT_NAMES[s]}`, desc: `Boost ${STAT_NAMES[s]} stat`, stat: s, statBonus: 3, powerBonus: 0, pctBonus: 0, tier: 'common' })),
            { icon: '🛡️', label: '+2 All Stats', desc: 'Boost everything', stat: 'all', statBonus: 2, powerBonus: 0, pctBonus: 0, tier: 'common' },
            { icon: '⚔️', label: '+3 Power', desc: 'Flat power boost', stat: null, statBonus: 0, powerBonus: 3, pctBonus: 0, tier: 'common' },
        ];
        const rarePool = [
            { icon: '💎', label: '+1 All +2 Power', desc: 'Balanced boost', stat: 'all', statBonus: 1, powerBonus: 2, pctBonus: 0, tier: 'rare' },
            ...stats.map(s => ({ icon: STAT_ICONS[s], label: `+3% ${STAT_NAMES[s]}`, desc: `Small % boost`, stat: s, statBonus: 0, powerBonus: 0, pctBonus: 3, tier: 'rare' })),
            { icon: '📊', label: '+2% All Stats', desc: 'Small % to everything', stat: 'all', statBonus: 0, powerBonus: 0, pctBonus: 2, tier: 'rare' },
            ...stats.map(s => ({ icon: STAT_ICONS[s], label: `+5 ${STAT_NAMES[s]}`, desc: `Strong single stat`, stat: s, statBonus: 5, powerBonus: 0, pctBonus: 0, tier: 'rare' })),
        ];
        const epicPool = [
            { icon: '🌟', label: '+3 All Stats', desc: 'Flat +3 to every stat', stat: 'all', statBonus: 3, powerBonus: 0, pctBonus: 0, tier: 'epic' },
            { icon: '👑', label: '+5 Power', desc: 'Big power boost', stat: null, statBonus: 0, powerBonus: 5, pctBonus: 0, tier: 'epic' },
            { icon: '💥', label: '+3% All Stats', desc: 'Multiply all stats by 3%', stat: 'all', statBonus: 0, powerBonus: 0, pctBonus: 3, tier: 'epic' },
            { icon: '⭐', label: '+2 All +3 Power', desc: 'Balanced epic boost', stat: 'all', statBonus: 2, powerBonus: 3, pctBonus: 0, tier: 'epic' },
            { icon: '🔮', label: `+5% ${STAT_NAMES[rs()]}`, desc: 'Good % to one stat', stat: rs(), statBonus: 0, powerBonus: 0, pctBonus: 5, tier: 'epic' },
            { icon: '🎯', label: `+8 ${STAT_NAMES[rs()]}`, desc: 'Big single stat', stat: rs(), statBonus: 8, powerBonus: 0, pctBonus: 0, tier: 'epic' },
        ];

        const choices = [];
        for (let i = 0; i < 3; i++) {
            const roll = Math.random() * 100;
            let tierPool;
            if (isMilestone) {
                tierPool = roll < 40 ? epicPool : roll < 75 ? rarePool : commonPool;
            } else {
                tierPool = roll < 5 ? epicPool : roll < 25 ? rarePool : commonPool;
            }
            const pick = tierPool[Math.floor(Math.random() * tierPool.length)];
            choices.push({ ...pick });
        }
        return choices;
    }

    function startTower() {
        if (!squadReady) { showToast('Fill all 5 positions.', 'error'); return; }
        floor = 0; towerBuffs = []; totalBEEarned = 0;
        clearTowerRun();
        nextFloor();
    }

    function continueTower() {
        if (!squadReady) { showToast('Fill all 5 positions.', 'error'); return; }
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
        const tLvl = get(skills).tactics || 0;
        const myVal = myStatAvgs[play.stat] || 0;
        const cpuCards = Object.values(currentEnemy.cards);
        const cpuVal = cpuCards.length > 0 ? Math.round(cpuCards.reduce((s,c) => s + (c.stats[cpuPlay.stat]||0), 0) / cpuCards.length) : 0;
        const statEdge = myVal - cpuVal;
        const myRoll = Math.floor(Math.random() * 11) - 5;
        const cpuRoll = Math.floor(Math.random() * 11) - 5;
        const myFinal = totalPower + statEdge + myRoll;
        const cpuFinal = currentEnemy.avgRating + cpuRoll;
        const won = myFinal >= cpuFinal;
        if (won) playerScore++; else cpuScore++;
        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won, tacticsBonus: tLvl, myBase: totalPower, cpuBase: currentEnemy.avgRating, statEdge, myRoll, cpuRoll }];
        grantXP(15);
        rollRoundPlays();
        if (playerScore >= 2 || cpuScore >= 2) {
            if (playerScore >= 2) {
                playSound('win');
                upgradeChoices = generateUpgrades(floor);
                if (floor % 10 === 0) {
                    const baseReward = Math.min(5000, 300 + Math.floor((floor / 10 - 1)) * 300);
                    const { total: floorReward, bonus: floorBonus } = grantBE(baseReward);
                    totalBEEarned += floorReward;
                    showToast(`Floor ${floor} cleared! +${floorReward} BE${floorBonus > 0 ? ` (+${floorBonus} Wealth)` : ''}`, 'success');
                }
                grantXP(50 + floor * 5);
                grantBPXP(25 + floor * 2);
                if (floor > bestFloor) trackStats.update(s => ({ ...s, towerHighestFloor: floor }));
                saveTowerRun();
                saveGame();
                phase = 'upgrade';
            } else {
                grantXP(30 + floor * 3);
                grantBPXP(10 + floor);
                playSound('lose');
                if (floor > bestFloor) trackStats.update(s => ({ ...s, towerHighestFloor: floor - 1 }));
                clearTowerRun();
                saveGame();
                phase = 'dead';
            }
        }
    }

    function pickUpgrade(upgrade) {
        towerBuffs = [...towerBuffs, upgrade];
        saveTowerRun();
        showToast(`${upgrade.label} applied!`, 'success');
        nextFloor();
    }

    function endRun() {
        clearTowerRun();
        floor = 0; towerBuffs = []; totalBEEarned = 0;
        phase = 'lobby';
    }
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
            {#if floor > 0}
                <div class="tw-saved">
                    <span class="tws-label">Run in progress — Floor {floor} · {towerBuffs.length} buffs · {totalBEEarned} BE</span>
                </div>
                {#if squadReady}
                    <div class="tw-btn-row">
                        <button class="tw-start" on:click={continueTower}>Continue Floor {floor + 1} →</button>
                        <button class="tw-abandon" on:click={endRun}>Abandon Run</button>
                    </div>
                {:else}
                    <p class="tw-warn">Fill all 5 squad positions to continue.</p>
                {/if}
            {:else if squadReady}
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
                <div class="power-compare">
                    <span class="pc-side pc-blue">{totalPower}</span>
                    <div class="pc-center">
                        <div class="pc-label">Base Power</div>
                        <div class="pc-diff" class:pc-pos={powerDiff > 0} class:pc-neg={powerDiff < 0} class:pc-even={powerDiff === 0}>{powerDiff > 0 ? '+' : ''}{powerDiff}</div>
                        <div class="pc-note">Net = Power + Stat · Luck ±5 each</div>
                    </div>
                    <span class="pc-side pc-red">{currentEnemy.avgRating}</span>
                </div>
                <div class="stat-compare"><div class="sc-title">Available Plays {#if tacticsLevel > 0}<span class="tactics-tag">🧠 +{tacticsLevel}</span>{/if}</div>
                    {#each roundPlays as play}{@const myVal=myStatAvgs[play.stat]||0}{@const cpuVal=cpuStatAvgs[play.stat]||0}{@const diff=myVal-cpuVal}
                        <div class="sc-row"><span class="sc-val sc-val-blue">{myVal}</span><div class="sc-bar-wrap"><div class="sc-label">{play.icon} {play.label}</div><div class="sc-bar"><div class="sc-fill-blue" style="width:{Math.min(100,(myVal/Math.max(myVal,cpuVal,1))*50)}%"></div><div class="sc-fill-red" style="width:{Math.min(100,(cpuVal/Math.max(myVal,cpuVal,1))*50)}%;margin-left:auto;"></div></div><div class="sc-diff" class:sc-diff-pos={diff>0} class:sc-diff-neg={diff<0}>{diff>0?'+':''}{diff} stat</div></div><span class="sc-val sc-val-red">{cpuVal}</span></div>
                    {/each}
                </div>
                {#if matchLog.length > 0}<div class="log-list">{#each matchLog as log}<div class="log-row" class:log-w={log.won} class:log-l={!log.won}><span class="log-result">{log.won?'✓':'✗'}</span><div class="log-breakdown"><div class="log-main">{log.myPlay.icon} <strong>{log.myVal}</strong> vs {log.cpuPlay.icon} <strong>{log.cpuVal}</strong></div><div class="log-detail-row"><span class="log-calc">{log.myBase}{log.statEdge>=0?'+':''}{log.statEdge}{log.myRoll>=0?'+':''}{log.myRoll}</span><span class="log-vs">vs</span><span class="log-calc">{log.cpuBase}{log.cpuRoll>=0?'+':''}{log.cpuRoll}</span></div></div></div>{/each}</div>{/if}
                {#if playerScore < 2 && cpuScore < 2}
                    <div class="play-picker"><div class="play-label">Choose Play</div>
                        <div class="play-grid">{#each roundPlays as play}{@const edge=(myStatAvgs[play.stat]||0)-(cpuStatAvgs[play.stat]||0)}{@const net=powerDiff+edge}<button class="play-btn" on:click={() => pickPlay(play)}><span class="pb-icon">{play.icon}</span><span class="pb-name">{play.label}</span><span class="pb-stat" class:pb-edge-pos={edge>0} class:pb-edge-neg={edge<0}>Stat {edge>0?'+':''}{edge}</span><span class="pb-net" class:pb-edge-pos={net>0} class:pb-edge-neg={net<0}>Net {net>0?'+':''}{net}</span></button>{/each}</div>
                    </div>
                {/if}
                <!-- Stat Chart with Buffs -->
                <div class="buff-panel">
                    <div class="buff-header">
                        <span class="buff-title">Squad Stats {towerBuffs.length > 0 ? `· ${towerBuffs.length} buffs` : ''}</span>
                        {#if buffSummary.power > 0}<span class="buff-power">Power +{buffSummary.power}</span>{/if}
                    </div>
                    <div class="buff-chart">
                        {#each ['mec','tmf','map','frm','cmp'] as s}
                            {@const base = baseStatAvgs[s] || 0}
                            {@const buffed = myStatAvgs[s] || 0}
                            {@const bonus = buffed - base}
                            {@const maxVal = Math.max(120, buffed + 10)}
                            <div class="bc-row">
                                <span class="bc-icon">{STAT_ICONS[s]}</span>
                                <span class="bc-label">{STAT_NAMES[s]}</span>
                                <div class="bc-bar-wrap">
                                    <div class="bc-bar-base" style="width: {(base / maxVal) * 100}%"></div>
                                    {#if bonus > 0}
                                        <div class="bc-bar-buff" style="left: {(base / maxVal) * 100}%; width: {(bonus / maxVal) * 100}%"></div>
                                    {/if}
                                </div>
                                <span class="bc-val">{base}</span>
                                {#if bonus > 0}
                                    <span class="bc-bonus">+{bonus}</span>
                                {/if}
                                <span class="bc-total">{buffed}</span>
                            </div>
                        {/each}
                    </div>
                    {#if towerBuffs.length > 0}
                        <div class="buff-breakdown">
                            {#each ['mec','tmf','map','frm','cmp'] as s}
                                {#if buffSummary.flat[s] > 0 || buffSummary.pct[s] > 0}
                                    <span class="bb-tag">
                                        {STAT_ICONS[s]}
                                        {#if buffSummary.flat[s] > 0}+{buffSummary.flat[s]}{/if}
                                        {#if buffSummary.pct[s] > 0} ×{100 + buffSummary.pct[s]}%{/if}
                                    </span>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
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
                    <button class="upg-card" class:upg-epic={u.tier==='epic'} class:upg-rare={u.tier==='rare'} on:click={() => pickUpgrade(u)}>
                        <span class="upg-icon">{u.icon}</span>
                        <span class="upg-label">{u.label}</span>
                        <span class="upg-desc">{u.desc}</span>
                        {#if u.tier === 'epic'}<span class="upg-tier upg-tier-epic">EPIC</span>
                        {:else if u.tier === 'rare'}<span class="upg-tier upg-tier-rare">RARE</span>{/if}
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
    .tw-saved { margin-bottom: 16px; }
    .tws-label { font-size: 13px; font-weight: 800; color: #fbbf24; }
    .tw-btn-row { display: flex; gap: 10px; justify-content: center; }
    .tw-abandon {
        padding: 14px 28px; border-radius: 12px;
        background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.3);
        color: #94a3b8; font-weight: 900; font-size: 12px; cursor: pointer; transition: all 0.12s;
    }
    .tw-abandon:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.2); color: #f87171; }
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
    .sc-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; text-align: center; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .tactics-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 6px; background: rgba(147,51,234,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; font-size: 9px; font-weight: 900; letter-spacing: 0; text-transform: none; }
    .log-tactics { color: #c084fc; font-size: 9px; font-weight: 700; margin-left: 2px; }
    .sc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .sc-val { font-size: 14px; font-weight: 900; width: 32px; text-align: center; } .sc-val-blue { color: #60a5fa; } .sc-val-red { color: #f87171; }
    .sc-bar-wrap { flex: 1; text-align: center; } .sc-label { font-size: 10px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
    .sc-bar { display: flex; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .sc-fill-blue { background: linear-gradient(90deg, #1e40af, #3b82f6); border-radius: 4px 0 0 4px; }
    .sc-fill-red { background: linear-gradient(90deg, #ef4444, #991b1b); border-radius: 0 4px 4px 0; }
    .sc-diff { font-size: 11px; font-weight: 900; color: #64748b; margin-top: 2px; } .sc-diff-pos { color: #34d399; } .sc-diff-neg { color: #f87171; }
    /* Power compare */
    .power-compare { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px; padding: 12px 16px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.15); }
    .pc-side { font-size: 22px; font-weight: 900; min-width: 40px; text-align: center; }
    .pc-blue { color: #60a5fa; } .pc-red { color: #f87171; }
    .pc-center { text-align: center; }
    .pc-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    .pc-diff { font-size: 18px; font-weight: 900; }
    .pc-pos { color: #34d399; } .pc-neg { color: #f87171; } .pc-even { color: #64748b; }
    .pc-note { font-size: 8px; color: #334155; margin-top: 2px; }

    .log-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
    .log-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 10px; font-size: 12px; background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15); }
    .log-w { border-color: rgba(16,185,129,0.15); } .log-l { border-color: rgba(239,68,68,0.15); }
    .log-result { font-weight: 900; font-size: 14px; flex-shrink: 0; } .log-w .log-result { color: #34d399; } .log-l .log-result { color: #f87171; }
    .log-breakdown { flex: 1; }
    .log-main { font-size: 12px; font-weight: 700; color: #e2e8f0; }
    .log-detail-row { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #475569; font-family: monospace; margin-top: 2px; }
    .log-calc { color: #64748b; } .log-vs { color: #334155; }
    .play-picker { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 16px; padding: 20px; }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 14px; }
    .play-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .play-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 12px; border-radius: 14px; cursor: pointer; background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3); transition: all 0.12s; }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(59,130,246,0.2); transform: scale(1.03); }
    .pb-icon { font-size: 24px; } .pb-name { font-size: 12px; font-weight: 900; color: #e2e8f0; }
    .pb-edge { font-size: 11px; font-weight: 900; color: #64748b; }
    .pb-stat { font-size: 10px; font-weight: 700; color: #64748b; }
    .pb-net { font-size: 12px; font-weight: 900; color: #64748b; margin-top: 2px; }
    .pb-edge-pos { color: #34d399; } .pb-edge-neg { color: #f87171; }

    /* Upgrade panel */
    .upg-panel { text-align: center; padding: 40px 24px; }
    .upg-title { font-size: 20px; font-weight: 900; color: #e2e8f0; margin-bottom: 24px; }
    .upg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 700px; margin: 0 auto; }
    @media (max-width: 600px) { .upg-grid { grid-template-columns: 1fr; } }
    .upg-card {
        padding: 32px 20px; border-radius: 18px; cursor: pointer;
        background: rgba(12,16,28,0.6); border: 2px solid rgba(51,65,85,0.25);
        transition: all 0.15s; display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .upg-card:hover { border-color: rgba(59,130,246,0.4); transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.4); }
    .upg-rare { border-color: rgba(99,102,241,0.3); background: rgba(99,102,241,0.04); }
    .upg-rare:hover { border-color: rgba(99,102,241,0.5); box-shadow: 0 12px 32px rgba(99,102,241,0.1); }
    .upg-epic { border-color: rgba(251,191,36,0.35); background: rgba(251,191,36,0.05); animation: epic-glow 2s ease-in-out infinite; }
    .upg-epic:hover { border-color: rgba(251,191,36,0.6); box-shadow: 0 12px 32px rgba(251,191,36,0.15); }
    @keyframes epic-glow { 0%,100% { box-shadow: 0 0 12px rgba(251,191,36,0.1); } 50% { box-shadow: 0 0 24px rgba(251,191,36,0.25); } }
    .upg-icon { font-size: 32px; }
    .upg-label { font-size: 16px; font-weight: 900; color: #f1f5f9; }
    .upg-desc { font-size: 11px; color: #64748b; line-height: 1.4; }
    .upg-tier { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; padding: 2px 10px; border-radius: 100px; }
    .upg-tier-epic { color: #fbbf24; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); }
    .upg-tier-rare { color: #818cf8; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); }

    /* Buff chart */
    .buff-panel {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(16,185,129,0.12);
        border-radius: 14px; padding: 16px;
    }
    .buff-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .buff-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #34d399; }
    .buff-power { font-size: 12px; font-weight: 900; color: #60a5fa; background: rgba(59,130,246,0.08); padding: 2px 10px; border-radius: 6px; border: 1px solid rgba(59,130,246,0.12); }
    .buff-chart { display: flex; flex-direction: column; gap: 8px; }
    .bc-row { display: flex; align-items: center; gap: 6px; }
    .bc-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
    .bc-label { font-size: 10px; font-weight: 900; color: #64748b; width: 32px; flex-shrink: 0; }
    .bc-bar-wrap {
        flex: 1; height: 14px; background: #1e293b; border-radius: 4px;
        position: relative; overflow: hidden;
    }
    .bc-bar-base {
        position: absolute; left: 0; top: 0; height: 100%; border-radius: 4px;
        background: linear-gradient(90deg, #1e40af, #3b82f6);
    }
    .bc-bar-buff {
        position: absolute; top: 0; height: 100%;
        background: linear-gradient(90deg, #059669, #34d399);
        border-radius: 0 4px 4px 0;
        animation: buffGrow 0.4s ease-out;
    }
    @keyframes buffGrow { from { width: 0 !important; } }
    .bc-val { font-size: 11px; font-weight: 800; color: #64748b; width: 26px; text-align: right; flex-shrink: 0; }
    .bc-bonus { font-size: 11px; font-weight: 900; color: #34d399; width: 32px; text-align: right; flex-shrink: 0; }
    .bc-total { font-size: 13px; font-weight: 900; color: #f1f5f9; width: 30px; text-align: right; flex-shrink: 0; }
    .buff-breakdown {
        display: flex; flex-wrap: wrap; gap: 4px; justify-content: center;
        margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(51,65,85,0.15);
    }
    .bb-tag {
        font-size: 9px; font-weight: 800; color: #34d399;
        background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.1);
        padding: 2px 8px; border-radius: 6px;
    }

    /* Results */
    .result-card { text-align: center; padding: 40px 24px; border-radius: 20px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); }
    .result-lose { border-color: rgba(239,68,68,0.15); background: rgba(127,29,29,0.06); }
    .result-icon { margin-bottom: 12px; }
    .result-title { font-size: 24px; font-weight: 900; margin-bottom: 8px; } .rt-lose { color: #f87171; }
    .result-sub { font-size: 12px; color: #94a3b8; }
    .result-reward { font-size: 18px; font-weight: 900; color: #60a5fa; margin-top: 8px; }
</style>
