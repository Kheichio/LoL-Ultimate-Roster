<script>
    import Card from '../card/Card.svelte';
    import { blueEssence, club, squad, trackStats, teamIdentity, managerXP, managerLevel, skillPoints, seasonData, battlePass, hasBoughtStarter, weightedTrophies, prestige, milestoneCards, matchHistory, saveGame } from '../../stores/game.js';
    import { switchTab } from '../../stores/ui.js';
    import { currentUser } from '../../stores/auth.js';
    import { showToast } from '../../stores/toasts.js';
    import { TIER_ORDER, ALL_SPECIAL, getEffectiveRating } from '../../utils/cards.js';

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: avgRating = starters.length > 0 ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: bestCard = [...$club].sort((a, b) => ((b.signature?1000:0)+(b.holographic?500:0)+b.rating) - ((a.signature?1000:0)+(a.holographic?500:0)+a.rating))[0] || null;
    $: tierBreakdown = (() => {
        const counts = {};
        $club.forEach(c => { counts[c.quality] = (counts[c.quality] || 0) + 1; });
        return TIER_ORDER.map(t => ({ tier: t, count: counts[t] || 0 })).filter(t => t.count > 0).reverse();
    })();
    $: recentCards = [...$club].slice(-5).reverse();

    $: recentMatches = ($matchHistory || []).slice(0, 6);
    const MODE_LABELS = { season: 'Season', goldenroad: 'Golden Road', cafe: 'Gaming Cafe', regional: 'Regional', firststand: 'First Stand', msi: 'MSI', worlds: 'Worlds', salarycap: 'Salary Cap', rival: 'Rival', tower: 'Tower', draft: 'Draft' };
    const MODE_ICONS = { season: '📅', goldenroad: '🌟', cafe: '☕', regional: '🏆', firststand: '🥇', msi: '🌍', worlds: '👑', salarycap: '💰', rival: '⚔️', tower: '🗼', draft: '📋' };
    function modeLabel(m) { return MODE_LABELS[m] || m; }
    function modeIcon(m) { return MODE_ICONS[m] || '🎮'; }
    function relTime(ts) {
        if (!ts) return '';
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        const min = Math.floor(s / 60);
        if (min < 60) return `${min}m ago`;
        const h = Math.floor(min / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }
    function resultLabel(r) { return r === 'win' ? 'W' : r === 'finalist' ? '2nd' : 'L'; }
    $: holoCount = $club.filter(c => c.holographic).length;
    $: sigCount = $club.filter(c => c.signature).length;

    // Next season game
    $: seasonOpponents = $seasonData.opponents || [];
    $: seasonMatchIndex = ($seasonData.matchResults || []).filter(r => r !== null).length;
    $: nextSeasonOpp = seasonOpponents[seasonMatchIndex] || null;
    $: seasonSplitActive = seasonOpponents.length > 0 && seasonMatchIndex < 10;

    // Leaderboard title
    function getTitle(tp) {
        if (tp >= 1000) return 'Immortal';
        if (tp >= 600) return 'Legend';
        if (tp >= 400) return 'Hall of Fame';
        if (tp >= 250) return 'President';
        if (tp >= 150) return 'Executive';
        if (tp >= 75) return 'GM';
        if (tp >= 30) return 'Director';
        if (tp >= 10) return 'Manager';
        return 'Scout';
    }
    $: prestigeTitle = getTitle($weightedTrophies);
    $: nextTitleThreshold = [10,30,75,150,250,400,600,1000].find(t => t > $weightedTrophies) || null;

    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return `${parseInt(h.substring(0,2),16)}, ${parseInt(h.substring(2,4),16)}, ${parseInt(h.substring(4,6),16)}`;
    }
    $: teamRgb = hexToRgb($teamIdentity.color || '#3b82f6');

    const tierGradients = { Bronze:'linear-gradient(90deg, #92400e, #b45309)', Silver:'linear-gradient(90deg, #94a3b8, #64748b)', Gold:'linear-gradient(90deg, #eab308, #f59e0b)', Platinum:'linear-gradient(90deg, #10b981, #22c55e)', Diamond:'linear-gradient(90deg, #3b82f6, #6366f1)', Master:'linear-gradient(90deg, #a855f7, #8b5cf6)', Grandmaster:'linear-gradient(90deg, #ef4444, #f43f5e)', Challenger:'linear-gradient(90deg, #f59e0b, #eab308)', Champion:'linear-gradient(90deg, #d97706, #f59e0b)', MVP:'linear-gradient(90deg, #ec4899, #f43f5e)', Finalist:'linear-gradient(90deg, #94a3b8, #cbd5e1)', MSI:'linear-gradient(90deg, #14b8a6, #2dd4bf)', FirstStand:'linear-gradient(90deg, #f97316, #fb923c)', POTY:'linear-gradient(90deg, #e94560, #f87171)', ROTY:'linear-gradient(90deg, #06b6d4, #22d3ee)', TOTY:'linear-gradient(90deg, #f59e0b, #fbbf24)', GPOTY:'linear-gradient(90deg, #a855f7, #d8b4fe)', X:'linear-gradient(90deg, #f43f5e, #fb7185)', 'Hall of Legends':'linear-gradient(90deg, #0a0a0a, #ff0033 55%, #fbbf24)' };
    const DEFAULT_ICONS = ['🛡️','⚔️','💎','🏆'];
    const DEFAULT_COLORS = ['#3b82f6','#f59e0b','#10b981','#64748b'];

    let editing = false;
    let editName = '';
    let editLogo = '';
    let editColor = '';
    let availableIcons = DEFAULT_ICONS;
    let availableColors = DEFAULT_COLORS;

    function startEdit() {
        editName = $teamIdentity.name;
        editLogo = $teamIdentity.logo;
        editColor = $teamIdentity.color || '#3b82f6';
        availableIcons = [...new Set([...DEFAULT_ICONS, ...($teamIdentity.unlockedIcons || []), editLogo])];
        availableColors = [...new Set([...DEFAULT_COLORS, ...($teamIdentity.unlockedColors || []), editColor])];
        editing = true;
    }
    function saveEdit() {
        if (!editName.trim()) { showToast('Enter a team name.', 'error'); return; }
        teamIdentity.update(t => ({ ...t, name: editName.trim(), logo: editLogo, color: editColor }));
        saveGame();
        editing = false;
        showToast('Team identity updated!', 'success');
    }
    function cancelEdit() { editing = false; }

    $: quickActions = [
        { label: 'Open Packs', tab: 'store', icon: '📦', bg: 'qa-blue', show: true },
        { label: 'Build Squad', tab: 'squad', icon: '👥', bg: 'qa-teal', show: starters.length < 5 },
        { label: 'Play Match', tab: 'tournament', icon: '⚔️', bg: 'qa-red', show: starters.length === 5 },
        { label: 'View Club', tab: 'club', icon: '🏟️', bg: 'qa-slate', show: $club.length > 0 },
        { label: 'Claim Starter', tab: 'store', icon: '🎁', bg: 'qa-green', show: !$hasBoughtStarter },
    ].filter(a => a.show);

    $: milestones = (() => {
        const all = [
            { label: 'Fill your starting 5', current: starters.length, target: 5 },
            { label: 'Collect 25 cards', current: $club.length, target: 25 },
            { label: 'Collect 50 cards', current: $club.length, target: 50 },
            { label: 'Win a tournament', current: $trackStats.tournamentsWon || 0, target: 1 },
            { label: 'Complete a season split', current: $trackStats.splitsCompleted || 0, target: 1 },
            { label: 'Collect 100 cards', current: $club.length, target: 100 },
            { label: 'Win a Regional Trophy', current: $trackStats.regionalSplitWon || 0, target: 1 },
            { label: 'Earn 50 Trophy Points', current: $weightedTrophies, target: 50 },
            { label: 'Win 10 tournaments', current: $trackStats.tournamentsWon || 0, target: 10 },
            { label: 'Complete 5 season splits', current: $trackStats.splitsCompleted || 0, target: 5 },
            { label: 'Win a First Stand', current: $trackStats.firstStandWon || 0, target: 1 },
            { label: 'Collect 200 cards', current: $club.length, target: 200 },
            { label: 'Earn 100 Trophy Points', current: $weightedTrophies, target: 100 },
            { label: 'Win an MSI', current: $trackStats.msiWon || 0, target: 1 },
            { label: 'Reach Tower Floor 25', current: $trackStats.towerHighestFloor || 0, target: 25 },
            { label: 'Win a World Championship', current: $trackStats.worldsWon || 0, target: 1 },
            { label: 'Complete a Golden Road', current: $trackStats.goldenRoads || 0, target: 1 },
            { label: 'Earn 250 Trophy Points', current: $weightedTrophies, target: 250 },
            { label: 'Win 50 tournaments', current: $trackStats.tournamentsWon || 0, target: 50 },
            { label: 'Reach Tower Floor 50', current: $trackStats.towerHighestFloor || 0, target: 50 },
            { label: 'Collect 500 cards', current: $club.length, target: 500 },
            { label: 'Earn 500 Trophy Points', current: $weightedTrophies, target: 500 },
            { label: 'Earn 1000 Trophy Points', current: $weightedTrophies, target: 1000 },
        ];
        const incomplete = all.filter(m => m.current < m.target);
        const complete = all.filter(m => m.current >= m.target);
        return [...incomplete.slice(0, 4), ...complete.slice(-1)].slice(0, 5);
    })();

    // ALL_SPECIAL covers legacy + award + mythic, so Hall of Legends shows up here too
    $: legacyCount = $club.filter(c => ALL_SPECIAL.includes(c.quality)).length;
    $: legacyBreakdown = (() => {
        const counts = {};
        $club.forEach(c => { if (ALL_SPECIAL.includes(c.quality)) counts[c.quality] = (counts[c.quality] || 0) + 1; });
        return ALL_SPECIAL.map(t => ({ tier: t, count: counts[t] || 0 })).filter(t => t.count > 0);
    })();

    const updates = [
        { ver: 'Beta 1.4.0', text: 'Summer Splits & a fresh coat of paint — 637 new cards: full LCK, LPL & LEC Summer Split rosters (main teams + head coaches) for 2018, 2019 and 2020, each rated to that split\'s real performance (Uzi \'18, the DAMWON \'20 Worlds core, and the G2/FPX \'19 super-teams on top). Redesigned EWC (gold-emerald "Trophy Forge"), Champion (imperial purple-gold) and Team of the Year (all-star chrome) cards; Diamond cards now use dark text and Grandmaster red is softer. The Bench picker adds role filters and sort-by-any-stat and shows every eligible card. Golden Road\'s world final is now a fair 120-power cap, plus a league-wide stat pass so every card\'s rating lines up with its stats.' },
        { ver: 'Beta 1.3.4', text: 'Transfer Market — the Trade tab now shows exactly which player you\'re signing (no more mystery). A randomised board of 6 real listings refreshes every 15 minutes; each can be signed once per rotation. Cost (spare cards + Blue Essence) scales with the player\'s tier, from Gold all the way up to Challenger and Legacy/Award cards.' },
        { ver: 'Beta 1.3.0', text: 'RBCs & EWC — Roster Building Challenges: a new daily mode (tab between Academy and Season) where you submit themed 5-card sets for free reward packs (Premium → EWC). EWC champion cards (T1 2024, Gen.G 2025, DK 2026) + EWC Store pack. Trade Market reworked into expensive, fully-random Master+ Mystery Trades. Friends moved next to Ranking; Home career stats reordered & recoloured.' },
        { ver: '1.2', text: 'Academy auto-farming team, Club quick-sell + sell duplicates, MSI 2026 champions (HLE), public leaderboard, Challenger no longer craftable, softer bronze cards' },
        { ver: '1.1.2', text: 'League Awards cards (POTY/TOTY/ROTY 2024+2025), Salary Cap Mode, Rival Challenge, Prestige System, Milestone Cards' },
        { ver: '1.1.1.2', text: '55 quests, 25 achievements, Draft Mode fixes, pity counter fix, ON card buff' },
        { ver: '1.1.0', text: 'Draft Mode, MSI 2026 Event, Wealth skill, Conditioning fix, dynamic milestones' },
    ];
</script>

<section class="home" style="--team-rgb: {teamRgb}; --team-color: {$teamIdentity.color || '#3b82f6'};">
    <div class="home-grid">

        <!-- LEFT SIDEBAR -->
        <div class="sidebar">
            <!-- Team Card -->
            <div class="panel team-card" style="border-color: {$teamIdentity.color || '#3b82f6'}15;">
                {#if !editing}
                    <div class="team-card-logo" style="filter: drop-shadow(0 4px 12px {$teamIdentity.color || '#3b82f6'}40);">{$teamIdentity.logo}</div>
                    <h2 class="team-card-name">{$teamIdentity.name}</h2>
                    <div class="team-card-level">Manager Lv {$managerLevel}</div>
                    {#if $currentUser}
                        <div class="team-card-user">{$currentUser.displayName || $currentUser.email}</div>
                    {/if}
                    <div class="team-card-bar">
                        <div class="team-card-fill" style="width: {Math.min(100, ($managerXP / ($managerLevel * 500)) * 100)}%; background: linear-gradient(90deg, {$teamIdentity.color || '#4f46e5'}, {$teamIdentity.color || '#6366f1'}cc);"></div>
                    </div>
                    <button class="edit-btn" on:click={startEdit}>✏️ Edit</button>
                {:else}
                    <!-- Edit Mode -->
                    <div class="edit-section">
                        <div class="edit-label">Team Icon</div>
                        <div class="icon-grid">
                            {#each availableIcons as icon}
                                <button class="icon-opt" class:icon-sel={editLogo === icon} on:click={() => editLogo = icon}>{icon}</button>
                            {/each}
                        </div>
                        <div class="edit-label">Team Name</div>
                        <input type="text" bind:value={editName} maxlength="20" class="input" style="width:100%; font-size:13px; text-align:center; margin-bottom:10px;">
                        <div class="edit-label">Team Color</div>
                        <div class="color-grid">
                            {#each availableColors as c}
                                <button class="color-opt" class:color-sel={editColor === c} style="background:{c};" on:click={() => editColor = c}></button>
                            {/each}
                        </div>
                        <div class="edit-preview" style="border-color:{editColor};">
                            <span style="font-size:28px;">{editLogo}</span>
                            <span style="font-size:13px; font-weight:900; color:#e2e8f0;">{editName || 'My Team'}</span>
                        </div>
                        <div class="edit-btns">
                            <button class="btn-primary" style="flex:1; padding:8px; font-size:11px;" on:click={saveEdit}>Save</button>
                            <button class="btn-secondary" style="flex:1; padding:8px; font-size:11px;" on:click={cancelEdit}>Cancel</button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Your Ranking -->
            <div class="panel" style="padding: 16px;">
                <div class="panel-label amber">Your Ranking</div>
                <div class="lb-preview">
                    <div class="lb-title-display">{prestigeTitle}</div>
                    <div class="lb-tp">{$weightedTrophies} Trophy Points</div>
                    {#if nextTitleThreshold}
                        <div class="lb-next">Next: {nextTitleThreshold - $weightedTrophies} TP to {getTitle(nextTitleThreshold)}</div>
                        <div class="lb-bar"><div class="lb-fill" style="width: {Math.min(100, ($weightedTrophies / nextTitleThreshold) * 100)}%"></div></div>
                    {:else}
                        <div class="lb-max">Max title reached!</div>
                    {/if}
                </div>
                <button class="panel-link" on:click={() => switchTab('leaderboard')}>View Leaderboard →</button>
            </div>

            <!-- Best Card -->
            {#if bestCard}
            <div class="panel" style="padding: 16px;">
                <div class="panel-label gold">Best Card</div>
                <div style="display: flex; justify-content: center; margin-top: 8px;">
                    <Card card={bestCard} mini={true} />
                </div>
            </div>
            {/if}

            <!-- Milestone Cards -->
            {#if $milestoneCards.length > 0}
            <div class="panel" style="padding: 16px;">
                <div class="panel-label" style="color:#fbbf24;">Career Milestones</div>
                <div class="cs-list">
                    {#each $milestoneCards as mc}
                    <div class="cs-item">
                        <span class="cs-icon">🏅</span>
                        <div>
                            <div class="cs-name" style="color:#fbbf24;">{mc.name}</div>
                            <div class="cs-desc">Earned milestone card · Rating {mc.rating}</div>
                        </div>
                    </div>
                    {/each}
                </div>
            </div>
            {/if}

            <!-- Coming Soon -->
            <div class="panel coming-soon" style="padding: 16px;">
                <div class="panel-label purple">Coming Soon</div>
                <div class="cs-list">
                    <div class="cs-item">
                        <span class="cs-icon">📊</span>
                        <div>
                            <div class="cs-name">Player Form System</div>
                            <div class="cs-desc">Cards go on hot/cold streaks based on recent match results.</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Updates -->
            <div class="panel" style="padding: 16px;">
                <div class="panel-label cyan">Latest Updates</div>
                <div class="update-list">
                    {#each updates as note}
                        <div class="update-row">
                            <span class="update-ver">{note.ver}</span>
                            <span class="update-text">{note.text}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <!-- CENTER -->
        <div class="center">
            <!-- Stats Strip -->
            <div class="stats-strip">
                {#each [
                    { icon: '💎', value: $blueEssence.toLocaleString(), label: 'Blue Essence', color: 'color-blue' },
                    { icon: '🏟️', value: $club.length, label: 'Cards', color: 'color-slate' },
                    { icon: '⚔️', value: starters.length === 5 ? avgRating : '—', label: 'Squad Power', color: 'color-green' },
                    { icon: '🏆', value: $weightedTrophies, label: 'Trophies', color: 'color-amber' },
                    { icon: '⭐', value: $skillPoints, label: 'Skill Points', color: 'color-yellow' },
                ] as stat}
                    <div class="stat-tile">
                        <span class="stat-icon">{stat.icon}</span>
                        <span class="stat-val {stat.color}">{stat.value}</span>
                        <span class="stat-lbl">{stat.label}</span>
                    </div>
                {/each}
            </div>

            <!-- Quick Actions -->
            <div class="actions-grid">
                {#each quickActions as action}
                    <button class="action-card {action.bg}" on:click={() => switchTab(action.tab)}>
                        <span class="action-icon">{action.icon}</span>
                        <span class="action-label">{action.label}</span>
                    </button>
                {/each}
            </div>

            <!-- Squad Preview -->
            <div class="panel" style="padding: 20px;">
                <div class="panel-header">
                    <div class="panel-label">Active Squad</div>
                    <button class="panel-link" on:click={() => switchTab('squad')}>Edit →</button>
                </div>
                {#if starters.length === 0}
                    <div class="empty-state">No squad built yet. Open packs and assign players!</div>
                {:else}
                    <div class="squad-preview">
                        {#each ['TOP','JNG','MID','ADC','SUP'] as role}
                            <div class="sq-slot">
                                <div class="sq-role">{role}</div>
                                {#if $squad[role]}
                                    <div class="sq-card">
                                        <div class="sq-rating">{$squad[role].rating}</div>
                                        <div class="sq-name">{$squad[role].name}</div>
                                    </div>
                                {:else}
                                    <div class="sq-empty">—</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    {#if starters.length === 5}
                        <div class="squad-avg">Avg <span class="color-blue">{avgRating}</span></div>
                    {/if}
                {/if}
            </div>

            <!-- Milestones -->
            <div class="panel" style="padding: 20px;">
                <div class="panel-label yellow">Milestones</div>
                <div class="milestones">
                    {#each milestones as m}
                        {@const done = m.current >= m.target}
                        <div class="milestone">
                            <div class="ms-check" class:ms-done={done}>{done ? '✓' : ''}</div>
                            <div class="ms-body">
                                <div class="ms-label" class:ms-label-done={done}>{m.label}</div>
                                <div class="ms-bar"><div class="ms-fill" class:ms-fill-done={done} style="width: {Math.min(100, (m.current/m.target)*100)}%"></div></div>
                            </div>
                            <div class="ms-count" class:color-green={done}>{m.current}/{m.target}</div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Recent Cards -->
            {#if recentCards.length > 0}
            <div class="panel" style="padding: 20px;">
                <div class="panel-label">Recently Acquired</div>
                <div class="recent-cards">
                    {#each recentCards as card (card.uniqueId)}
                        <Card {card} mini={true} />
                    {/each}
                </div>
            </div>
            {/if}

            <!-- Recent Matches -->
            {#if recentMatches.length > 0}
            <div class="panel" style="padding: 20px;">
                <div class="panel-label">Recent Matches</div>
                <div class="rm-list">
                    {#each recentMatches as mt}
                        <div class="rm-row">
                            <span class="rm-result rm-{mt.result}">{resultLabel(mt.result)}</span>
                            <span class="rm-icon">{modeIcon(mt.mode)}</span>
                            <div class="rm-info">
                                <span class="rm-mode">{modeLabel(mt.mode)}{mt.floor ? ` · Floor ${mt.floor}` : ''}</span>
                                <span class="rm-opp">vs {mt.opponent || '—'}</span>
                            </div>
                            <div class="rm-rewards">
                                {#if mt.be > 0}<span class="rm-be">+{mt.be.toLocaleString()} BE</span>{/if}
                                <span class="rm-time">{relTime(mt.ts)}</span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
            {/if}
        </div>

        <!-- RIGHT SIDEBAR -->
        <div class="sidebar">
            <!-- Collection -->
            <div class="panel" style="padding: 16px;">
                <div class="panel-label">Collection</div>
                {#if tierBreakdown.length === 0}
                    <div class="empty-state">No cards yet</div>
                {:else}
                    <div class="tier-bars">
                        {#each tierBreakdown as { tier, count }}
                            <div class="tier-row">
                                <span class="tier-name">{tier}</span>
                                <div class="tier-track"><div class="tier-fill" style="width: {Math.min(100, (count / Math.max(...tierBreakdown.map(t => t.count))) * 100)}%; background: {tierGradients[tier] || 'linear-gradient(90deg, #64748b, #475569)'}"></div></div>
                                <span class="tier-count">{count}</span>
                            </div>
                        {/each}
                    </div>
                    <div class="collection-footer">{holoCount} Holo · {sigCount} Sig</div>
                {/if}
            </div>

            <!-- Legacy Collection -->
            <div class="panel" style="padding: 16px;">
                <div class="panel-label gold">Legacy & Award Cards</div>
                {#if legacyBreakdown.length === 0}
                    <div class="empty-state">No legacy cards yet. Win tournaments to earn them!</div>
                {:else}
                    <div class="tier-bars">
                        {#each legacyBreakdown as { tier, count }}
                            <div class="tier-row">
                                <span class="tier-name">{tier}</span>
                                <div class="tier-track"><div class="tier-fill" style="width: {Math.min(100, (count / Math.max(...legacyBreakdown.map(t => t.count), 1)) * 100)}%; background: {tierGradients[tier] || 'linear-gradient(90deg, #64748b, #475569)'}"></div></div>
                                <span class="tier-count">{count}</span>
                            </div>
                        {/each}
                    </div>
                    <div class="collection-footer">{legacyCount} total legacy cards</div>
                {/if}
            </div>

            <!-- Season + Next Game -->
            <div class="panel" style="padding: 16px;">
                <div class="panel-label blue">Season Split {$seasonData.currentSplit}</div>
                <div class="season-record">{$seasonData.splitWins || 0}W - {$seasonData.splitLosses || 0}L</div>
                {#if nextSeasonOpp && seasonSplitActive}
                    <div class="next-game">
                        <div class="ng-label">Next Match</div>
                        <div class="ng-row">
                            <span class="ng-num">#{seasonMatchIndex + 1}</span>
                            <span class="ng-name">{nextSeasonOpp.name}</span>
                            <span class="ng-pwr">{nextSeasonOpp.avgRating}</span>
                        </div>
                    </div>
                {:else if !seasonSplitActive && seasonOpponents.length === 0}
                    <div class="season-idle">No split in progress</div>
                {:else}
                    <div class="season-idle">Split complete!</div>
                {/if}
                <button class="panel-link" on:click={() => switchTab('season')}>{seasonSplitActive ? 'Continue Split →' : 'Go to Season →'}</button>
            </div>

            <!-- Battle Pass -->
            <div class="panel bp-panel" style="padding: 16px;">
                <div class="panel-label amber">Battle Pass</div>
                <div class="bp-row">
                    <span class="bp-season">S{$battlePass.season}</span>
                    <span class="bp-tier">Tier {$battlePass.tier}/100</span>
                </div>
                <div class="bp-bar"><div class="bp-fill" style="width: {Math.min(100, ($battlePass.tier/100)*100)}%"></div></div>
                <button class="panel-link" on:click={() => switchTab('rewards')}>View Rewards →</button>
            </div>

            <!-- Career -->
            <div class="panel" style="padding: 16px;">
                <div class="panel-label">Career Stats</div>
                <div class="career-list">
                    {#each [
                        { label: 'Golden Roads',  value: $trackStats.goldenRoads || 0,       color: '#fde047', icon: '🌟' },
                        { label: 'Worlds Wins',   value: $trackStats.worldsWon || 0,          color: '#fbbf24', icon: '👑' },
                        { label: 'MSI Wins',      value: $trackStats.msiWon || 0,             color: '#2dd4bf', icon: '🌍' },
                        { label: 'First Stand',   value: $trackStats.firstStandWon || 0,      color: '#fb923c', icon: '🥇' },
                        { label: 'Regional Wins', value: $trackStats.regionalSplitWon || 0,   color: '#60a5fa', icon: '🏆' },
                        { label: 'Splits Done',   value: $trackStats.splitsCompleted || 0,    color: '#a78bfa', icon: '📅' },
                        { label: 'Cafe Wins',     value: $trackStats.cafeWins || 0,           color: '#4ade80', icon: '☕' },
                        { label: 'Tower Best',    value: $trackStats.towerHighestFloor || 0,  color: '#f87171', icon: '🗼' },
                        { label: 'Packs Opened',  value: $trackStats.packs || 0,              color: '#e879f9', icon: '📦' },
                        { label: 'Cards Sold',    value: $trackStats.soldCount || 0,          color: '#94a3b8', icon: '💰' },
                    ] as stat}
                        <div class="career-row" style="border-left-color: {stat.color}; background: linear-gradient(90deg, rgba({hexToRgb(stat.color)}, 0.14), transparent 72%);">
                            <span class="career-icon">{stat.icon}</span>
                            <span class="career-label">{stat.label}</span>
                            <span class="career-val" style="color: {stat.color};">{stat.value}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>


</section>

<style>
    .home { padding-bottom: 40px; }
    .home-grid { display: grid; grid-template-columns: 260px 1fr 260px; gap: 20px; }
    @media (max-width: 1100px) { .home-grid { grid-template-columns: 1fr; } }
    @media (min-width: 1101px) and (max-width: 1400px) { .home-grid { grid-template-columns: 220px 1fr 220px; gap: 14px; } }
    .sidebar { display: flex; flex-direction: column; gap: 14px; }
    .center { display: flex; flex-direction: column; gap: 16px; }

    /* Panel base */
    .panel {
        background: linear-gradient(135deg, rgba(var(--team-rgb), 0.16) 0%, rgba(12, 16, 28, 0.62) 46%);
        border: 1px solid rgba(var(--team-rgb), 0.2);
        border-radius: 16px;
        backdrop-filter: blur(6px);
    }
    .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .panel-label {
        font-size: 10px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #475569; margin-bottom: 10px;
    }
    .panel-label.gold { color: #f59e0b; }
    .panel-label.cyan { color: #06b6d4; }
    .panel-label.blue { color: #3b82f6; }
    .panel-label.yellow { color: #eab308; }
    .panel-label.amber { color: #f59e0b; }
    .panel-link {
        font-size: 10px; font-weight: 700; color: #3b82f6; background: none; border: none;
        cursor: pointer; transition: color 0.1s;
    }
    .panel-link:hover { color: #60a5fa; }
    .empty-state { color: #334155; font-size: 12px; text-align: center; padding: 20px 0; font-style: italic; }

    /* Colors */
    .color-blue { color: #60a5fa; }
    .color-green { color: #34d399; }
    .color-amber { color: #fbbf24; }
    .color-yellow { color: #eab308; }
    .color-slate { color: #94a3b8; }
    .color-red { color: #f87171; }

    /* Team Card */
    .team-card { padding: 24px 16px; text-align: center; border-color: rgba(79,70,229,0.12); }
    .team-card-logo { font-size: 40px; margin-bottom: 8px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3)); }
    .team-card-name { font-size: 16px; font-weight: 900; color: #e2e8f0; }
    .team-card-level { font-size: 11px; color: #64748b; margin-top: 2px; }
    .team-card-user { font-size: 10px; color: #4338ca; margin-top: 4px; }
    .team-card-bar { width: 100%; height: 4px; background: #1e293b; border-radius: 4px; margin-top: 12px; overflow: hidden; }
    .team-card-fill { height: 100%; background: linear-gradient(90deg, #4f46e5, #6366f1); border-radius: 4px; transition: width 0.5s; }

    /* Stats Strip */
    .stats-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
    @media (max-width: 768px) { .stats-strip { grid-template-columns: repeat(3, 1fr); } }
    .stat-tile {
        background: linear-gradient(160deg, rgba(var(--team-rgb), 0.2) 0%, rgba(12,16,28,0.62) 58%);
        border: 1px solid rgba(var(--team-rgb), 0.22);
        border-radius: 14px; padding: 14px 8px; text-align: center;
        display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .stat-icon { font-size: 18px; }
    .stat-val { font-size: 20px; font-weight: 900; }
    .stat-lbl { font-size: 8px; color: #475569; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }

    /* Edit Panel */
    .edit-btn {
        margin-top: 12px; padding: 5px 16px; border-radius: 8px;
        font-size: 10px; font-weight: 700; color: #64748b;
        background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.2);
        cursor: pointer; transition: all 0.12s;
    }
    .edit-btn:hover { color: #94a3b8; background: rgba(51,65,85,0.4); }
    .edit-section { width: 100%; }
    .edit-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin-bottom: 6px; margin-top: 10px; }
    .icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 8px; }
    .icon-opt {
        width: 100%; aspect-ratio: 1; border-radius: 8px; font-size: 18px;
        background: rgba(15,23,42,0.3); border: 2px solid transparent;
        cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.1s;
    }
    .icon-opt:hover { background: rgba(30,41,59,0.5); }
    .icon-sel { border-color: #3b82f6 !important; background: rgba(59,130,246,0.1) !important; }
    .color-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 10px; }
    .color-opt {
        width: 100%; aspect-ratio: 1; border-radius: 6px;
        border: 2px solid transparent; cursor: pointer; transition: all 0.1s;
    }
    .color-opt:hover { transform: scale(1.1); }
    .color-sel { border-color: white !important; transform: scale(1.15); box-shadow: 0 0 10px rgba(255,255,255,0.15); }
    .edit-preview {
        display: flex; align-items: center; gap: 8px; justify-content: center;
        padding: 10px; border-radius: 10px; border: 2px solid;
        background: rgba(15,23,42,0.3); margin-bottom: 10px;
    }
    .edit-btns { display: flex; gap: 6px; }

    /* Quick Actions */
    .actions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
    .action-card {
        padding: 18px 12px; border-radius: 14px; text-align: center;
        cursor: pointer; border: 1px solid rgba(255,255,255,0.06);
        transition: transform 0.12s, box-shadow 0.12s;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
    }
    .action-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .qa-blue { background: linear-gradient(135deg, #1e3a8a, #1e40af); }
    .qa-teal { background: linear-gradient(135deg, #065f46, #047857); }
    .qa-red { background: linear-gradient(135deg, #7f1d1d, #991b1b); }
    .qa-slate { background: linear-gradient(135deg, #1e293b, #334155); }
    .qa-green { background: linear-gradient(135deg, #14532d, #166534); }
    .action-icon { font-size: 24px; }
    .action-label { font-size: 11px; font-weight: 900; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Squad Preview */
    .squad-preview { display: flex; gap: 10px; justify-content: center; }
    .sq-slot { text-align: center; flex: 1; }
    .sq-role { font-size: 8px; font-weight: 900; color: #475569; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px; }
    .sq-card {
        background: linear-gradient(135deg, rgba(var(--team-rgb), 0.22) 0%, rgba(30,41,59,0.4) 66%);
        border: 1px solid rgba(var(--team-rgb), 0.26);
        border-radius: 10px; padding: 10px 6px;
    }
    .sq-rating { font-size: 20px; font-weight: 900; color: #e2e8f0; }
    .sq-name { font-size: 9px; color: #64748b; font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sq-empty {
        background: rgba(15,23,42,0.3); border: 1px dashed rgba(51,65,85,0.3);
        border-radius: 10px; padding: 14px 6px; color: #1e293b; font-size: 16px;
    }
    .squad-avg { text-align: center; margin-top: 10px; font-size: 12px; font-weight: 700; color: #475569; }

    /* Milestones */
    .milestones { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
    .milestone { display: flex; align-items: center; gap: 10px; }
    .ms-check {
        width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
        background: #1e293b; display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 900; color: transparent;
    }
    .ms-done { background: #059669; color: white; }
    .ms-body { flex: 1; min-width: 0; }
    .ms-label { font-size: 12px; font-weight: 700; color: #94a3b8; }
    .ms-label-done { color: #475569; text-decoration: line-through; }
    .ms-bar { width: 100%; height: 4px; background: #1e293b; border-radius: 4px; margin-top: 4px; overflow: hidden; }
    .ms-fill { height: 100%; background: #3b82f6; border-radius: 4px; transition: width 0.5s; }
    .ms-fill-done { background: #059669; }
    .ms-count { font-size: 10px; font-weight: 700; color: #475569; flex-shrink: 0; width: 40px; text-align: right; }

    /* Recent Cards */
    .recent-cards { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; margin-top: 4px; }

    /* Recent Matches */
    .rm-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .rm-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(15,23,42,0.3); }
    .rm-result { flex: 0 0 auto; min-width: 32px; text-align: center; font-size: 11px; font-weight: 900; padding: 3px 6px; border-radius: 6px; }
    .rm-win { background: rgba(52,211,153,0.15); color: #34d399; }
    .rm-loss { background: rgba(248,113,113,0.12); color: #f87171; }
    .rm-finalist { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .rm-icon { font-size: 16px; flex: 0 0 auto; }
    .rm-info { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
    .rm-mode { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .rm-opp { font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
    .rm-rewards { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; }
    .rm-be { font-size: 10px; font-weight: 800; color: #34d399; }
    .rm-time { font-size: 9px; color: #475569; }

    /* Tier bars */
    .tier-bars { display: flex; flex-direction: column; gap: 6px; }
    .tier-row { display: flex; align-items: center; gap: 6px; }
    .tier-name { font-size: 9px; font-weight: 800; color: #64748b; width: 70px; text-align: right; }
    .tier-track { flex: 1; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .tier-fill { height: 100%; border-radius: 4px; transition: width 0.5s; min-width: 2px; }
    .tier-count { font-size: 9px; font-weight: 700; color: #475569; width: 20px; }
    .collection-footer { text-align: center; font-size: 9px; color: #334155; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(51,65,85,0.15); }

    /* Season */
    .season-record { font-size: 12px; color: #64748b; margin-bottom: 10px; font-weight: 700; }
    .season-idle { font-size: 11px; color: #334155; font-style: italic; margin-bottom: 8px; }

    /* Next Game */
    .next-game {
        background: rgba(30,58,138,0.12); border: 1px solid rgba(59,130,246,0.12);
        border-radius: 10px; padding: 10px; margin-bottom: 10px;
    }
    .ng-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #3b82f6; margin-bottom: 6px; }
    .ng-row { display: flex; align-items: center; gap: 8px; }
    .ng-num { font-size: 11px; font-weight: 900; color: #60a5fa; }
    .ng-name { flex: 1; font-size: 12px; font-weight: 800; color: #e2e8f0; }
    .ng-pwr { font-size: 12px; font-weight: 900; color: #f87171; }

    /* Leaderboard Preview */
    .lb-preview { text-align: center; margin-bottom: 10px; }
    .lb-title-display { font-size: 18px; font-weight: 900; color: #fbbf24; margin-bottom: 2px; }
    .lb-tp { font-size: 11px; color: #64748b; margin-bottom: 8px; }
    .lb-next { font-size: 9px; color: #475569; margin-bottom: 6px; }
    .lb-bar { width: 100%; height: 4px; background: #1e293b; border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
    .lb-fill { height: 100%; background: linear-gradient(90deg, #d97706, #fbbf24); border-radius: 4px; transition: width 0.5s; }
    .lb-max { font-size: 9px; color: #fbbf24; font-weight: 800; }

    /* Battle Pass */
    .bp-panel { border-color: rgba(245,158,11,0.1); }
    .bp-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; }
    .bp-season { font-weight: 800; color: #f59e0b; }
    .bp-tier { color: #475569; font-weight: 600; }
    .bp-bar { width: 100%; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
    .bp-fill { height: 100%; background: linear-gradient(90deg, #d97706, #f59e0b); border-radius: 4px; transition: width 0.5s; }

    /* Updates */
    .update-list { display: flex; flex-direction: column; gap: 6px; }
    .update-row { display: flex; align-items: baseline; gap: 8px; font-size: 11px; }
    .update-ver {
        flex-shrink: 0; font-size: 9px; font-weight: 900; color: #06b6d4;
        background: rgba(6, 182, 212, 0.08); padding: 2px 8px; border-radius: 6px;
        border: 1px solid rgba(6, 182, 212, 0.1);
    }
    .update-text { color: #475569; line-height: 1.4; }

    /* Career */
    .career-list { display: flex; flex-direction: column; gap: 5px; }
    .career-row {
        display: flex; align-items: center; gap: 8px; font-size: 11px;
        padding: 6px 9px; border-radius: 8px;
        border-left: 3px solid #475569; transition: transform 0.1s;
    }
    .career-row:hover { transform: translateX(2px); }
    .career-icon { font-size: 13px; flex-shrink: 0; line-height: 1; }
    .career-label { color: #cbd5e1; flex: 1; font-weight: 700; }
    .career-val { font-weight: 900; font-size: 14px; flex-shrink: 0; }

    /* Extra colors */
    .panel-label.gold { color: #fbbf24; }
    .panel-label.purple { color: #c084fc; }

    /* Coming Soon */
    .coming-soon { border-color: rgba(168,85,247,0.15) !important; }
    .cs-list { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
    .cs-item { display: flex; gap: 10px; align-items: start; padding: 8px 10px; border-radius: 10px; background: rgba(15,23,42,0.3); }
    .cs-icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
    .cs-name { font-size: 11px; font-weight: 900; color: #c084fc; }
    .cs-desc { font-size: 9px; color: #475569; margin-top: 2px; line-height: 1.4; }
</style>
