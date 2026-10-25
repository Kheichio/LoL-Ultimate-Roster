<script>
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { blueEssence, club, squad, trackStats, teamIdentity, managerXP, managerLevel, seasonData, battlePass, hasBoughtStarter, weightedTrophies, prestige, milestoneCards, matchHistory, saveGame } from '../../stores/game.js';
    import { ME, MATCHDAYS, splitInfo, myPlayed, myFixture, standings, myPlayoffSeries } from '../../utils/league.js';
    import { switchTab } from '../../stores/ui.js';
    import { currentUser } from '../../stores/auth.js';
    import { showToast } from '../../stores/toasts.js';
    import { badges } from '../../stores/badges.js';
    import { TIER_ORDER, ALL_SPECIAL, TIER_COLORS, getEffectiveRating } from '../../utils/cards.js';
    import { XP_PER_TIER, MAX_TIER } from '../../utils/battlepass.js';
    // The update log is deliberately NOT on this page any more — it lives on the main menu.

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: avgRating = starters.length > 0 ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: bestCard = [...$club].sort((a, b) => ((b.signature?1000:0)+(b.holographic?500:0)+b.rating) - ((a.signature?1000:0)+(a.holographic?500:0)+a.rating))[0] || null;
    $: tierBreakdown = (() => {
        const counts = {};
        $club.forEach(c => { counts[c.quality] = (counts[c.quality] || 0) + 1; });
        return TIER_ORDER.map(t => ({ tier: t, count: counts[t] || 0 })).filter(t => t.count > 0).reverse();
    })();
    $: recentCards = [...$club].slice(-6).reverse();

    $: recentMatches = ($matchHistory || []).slice(0, 6);
    const MODE_LABELS = { season: 'Season', goldenroad: 'Golden Road', cafe: 'Gaming Cafe', regional: 'Regional', firststand: 'First Stand', msi: 'MSI', worlds: 'Worlds', salarycap: 'Salary Cap', rival: 'Rival', tower: 'Tower', draft: 'Draft' };
    const MODE_ICONS = { season: 'calendar', goldenroad: 'crown', cafe: 'coffee', regional: 'flag', firststand: 'flame', msi: 'waves', worlds: 'trophy', salarycap: 'coins', rival: 'swords', tower: 'tower', draft: 'cards' };
    function modeLabel(m) { return MODE_LABELS[m] || m; }
    function modeIcon(m) { return MODE_ICONS[m] || 'play'; }
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

    // Next season game (utils/league.js — a league table, then the Regional Trophy)
    $: sdh = $seasonData;
    $: hLeague = sdh.league;
    $: hPlayed = myPlayed(hLeague);
    $: hSplit = splitInfo(sdh.currentSplit);
    $: hRow = hLeague ? standings(hLeague, 0).find(r => r.id === ME) : null;
    $: hQualified = sdh.qualified && !sdh.qualified.played ? sdh.qualified : null;
    $: nextSeasonOpp = (() => {
        if (sdh.stage === 'league' && hLeague && hPlayed < MATCHDAYS) {
            const f = myFixture(hLeague, hPlayed);
            return f ? hLeague.teams.find(t => t.id === f.opponentId) || null : null;
        }
        if (sdh.stage === 'playoffs' && sdh.playoffs) {
            const s = myPlayoffSeries(sdh.playoffs);
            if (!s) return null;
            const id = s.match.a === ME ? s.match.b : s.match.a;
            return (hLeague?.teams || []).find(t => t.id === id) || null;
        }
        return null;
    })();
    $: seasonSplitActive = sdh.stage === 'league' || sdh.stage === 'playoffs';
    $: nextSeasonLabel = sdh.stage === 'playoffs' ? 'Regional Trophy' : `Matchday ${hPlayed + 1}`;

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
        const h = (hex || '#3b82f6').replace('#', '');
        return `${parseInt(h.substring(0,2),16)}, ${parseInt(h.substring(2,4),16)}, ${parseInt(h.substring(4,6),16)}`;
    }
    $: teamColor = $teamIdentity.color || '#3b82f6';
    $: teamRgb = hexToRgb(teamColor);
    $: xpNeed = $managerLevel * 500;
    $: xpPct = Math.min(100, ($managerXP / xpNeed) * 100);

    // ── The one thing to do next ──
    // A new manager is walked through the opening steps in order; after that it is always
    // either the split in progress or the Play menu.
    $: nextStep = !$hasBoughtStarter
        ? { label: 'Claim your free Starter Pack', sub: 'Six cards to start your club', tab: 'store', icon: 'gift' }
        : starters.length < 5
        ? { label: 'Build your starting five', sub: `${starters.length}/5 roles filled`, tab: 'squad', icon: 'squad' }
        : seasonSplitActive && nextSeasonOpp
        ? { label: `Continue the ${hSplit.name} split`, sub: `${nextSeasonLabel} vs ${nextSeasonOpp.name}`, tab: 'season', icon: 'calendar' }
        : sdh.stage === 'done'
        ? { label: 'Claim your split rewards', sub: `The ${hSplit.name} split is over`, tab: 'season', icon: 'gift' }
        : hQualified
        ? { label: `Play ${hQualified.eventName}`, sub: 'You qualified through the Season', tab: 'tournament', icon: 'trophy' }
        : { label: `Start the ${hSplit.name} split`, sub: 'Ten-team league, then the Regional Trophy', tab: 'season', icon: 'calendar' };

    // ── To do ──
    // Every item is something waiting for the player right now, from stores/badges.js — the
    // same counts the nav badges show. Ordered by how much it is worth acting on.
    $: todo = [
        $badges.starterPack && { tab: 'store', icon: 'gift', c: '#34d399', label: 'Free Starter Pack', sub: 'Six cards, one per role' },
        $badges.starters < 5 && $badges.starterPack === 0 && { tab: 'squad', icon: 'squad', c: '#60a5fa', label: 'Fill your starting five', sub: `${$badges.starters}/5 roles set` },
        $badges.daily && { tab: 'rewards', icon: 'gift', c: '#f472b6', label: 'Daily reward ready', sub: 'Keep your login streak alive' },
        $badges.battlePass && { tab: 'rewards', icon: 'star', c: '#a78bfa', label: `${$badges.battlePass} Battle Pass reward${$badges.battlePass === 1 ? '' : 's'}`, sub: 'Unlocked and waiting to be claimed' },
        $badges.quests && { tab: 'quests', icon: 'quests', c: '#facc15', label: `${$badges.quests} quest reward${$badges.quests === 1 ? '' : 's'}`, sub: 'Milestones, contracts and achievements' },
        $badges.academy && { tab: 'academy', icon: 'academy', c: '#34d399', label: 'Academy run finished', sub: 'Collect your Blue Essence and XP' },
        $badges.rbc && { tab: 'rbc', icon: 'puzzle', c: '#fb923c', label: 'New Roster Challenges', sub: 'Five fresh challenges today' },
        $badges.skills && { tab: 'skills', icon: 'skills', c: '#fde047', label: `${$badges.skills} skill point${$badges.skills === 1 ? '' : 's'} to spend`, sub: 'Upgrade your manager' },
        $badges.upgrade && { tab: 'upgrade', icon: 'upgrade', c: '#c084fc', label: `${$badges.upgrade} upgrade${$badges.upgrade === 1 ? '' : 's'} available`, sub: 'Spare cards ready to combine' },
        $badges.collection && { tab: 'collection', icon: 'archive', c: '#fcd34d', label: `${$badges.collection} new card${$badges.collection === 1 ? '' : 's'} in the Archive`, sub: `Claim ${($badges.collection * 25).toLocaleString()} BE for discovering them` },
        $badges.friends && { tab: 'friends', icon: 'friends', c: '#4ade80', label: `${$badges.friends} friend request${$badges.friends === 1 ? '' : 's'}`, sub: 'Someone wants to connect' },
    ].filter(Boolean);

    // Cosmetics come from the Battle Pass; the four defaults are always available.
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
        editColor = teamColor;
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

    $: milestones = (() => {
        const all = [
            { label: 'Fill your starting 5', current: starters.length, target: 5 },
            { label: 'Collect 25 cards', current: $club.length, target: 25 },
            { label: 'Collect 50 cards', current: $club.length, target: 50 },
            { label: 'Win a tournament', current: $trackStats.tournamentsWon || 0, target: 1 },
            { label: 'Complete a season split', current: $trackStats.splitsCompleted || 0, target: 1 },
            { label: 'Collect 100 cards', current: $club.length, target: 100 },
            { label: 'Win a Regional Trophy', current: $trackStats.regionalSplitWon || 0, target: 1 },
            { label: 'Reach  Achievement Score', current: $weightedTrophies, target: 50 },
            { label: 'Win 10 tournaments', current: $trackStats.tournamentsWon || 0, target: 10 },
            { label: 'Complete 5 season splits', current: $trackStats.splitsCompleted || 0, target: 5 },
            { label: 'Win a First Stand', current: $trackStats.firstStandWon || 0, target: 1 },
            { label: 'Collect 200 cards', current: $club.length, target: 200 },
            { label: 'Reach  Achievement Score', current: $weightedTrophies, target: 100 },
            { label: 'Win an MSI', current: $trackStats.msiWon || 0, target: 1 },
            { label: 'Reach Tower Floor 25', current: $trackStats.towerHighestFloor || 0, target: 25 },
            { label: 'Win a World Championship', current: $trackStats.worldsWon || 0, target: 1 },
            { label: 'Complete a Golden Road', current: $trackStats.goldenRoads || 0, target: 1 },
            { label: 'Reach  Achievement Score', current: $weightedTrophies, target: 250 },
            { label: 'Win 50 tournaments', current: $trackStats.tournamentsWon || 0, target: 50 },
            { label: 'Reach Tower Floor 50', current: $trackStats.towerHighestFloor || 0, target: 50 },
            { label: 'Collect 500 cards', current: $club.length, target: 500 },
            { label: 'Reach  Achievement Score', current: $weightedTrophies, target: 500 },
            { label: 'Reach  Achievement Score', current: $weightedTrophies, target: 1000 },
        ];
        return all.filter(m => m.current < m.target).slice(0, 4);
    })();

    // ALL_SPECIAL covers legacy + award + mythic, so Hall of Legends shows up here too
    $: legacyBreakdown = (() => {
        const counts = {};
        $club.forEach(c => { if (ALL_SPECIAL.includes(c.quality)) counts[c.quality] = (counts[c.quality] || 0) + 1; });
        return ALL_SPECIAL.map(t => ({ tier: t, count: counts[t] || 0 })).filter(t => t.count > 0);
    })();
    let collectionView = 'tiers';
    $: collectionRows = collectionView === 'tiers' ? tierBreakdown : legacyBreakdown;
    $: collectionMax = Math.max(1, ...collectionRows.map(t => t.count));

    $: cabinet = [
        { label: 'Worlds',       value: $trackStats.worldsWon || 0,         c: '#fbbf24', icon: 'trophy' },
        { label: 'MSI',          value: $trackStats.msiWon || 0,            c: '#2dd4bf', icon: 'waves' },
        { label: 'First Stand',  value: $trackStats.firstStandWon || 0,     c: '#fb923c', icon: 'flame' },
        { label: 'Regional',     value: $trackStats.regionalSplitWon || 0,  c: '#60a5fa', icon: 'flag' },
        { label: 'Golden Roads', value: $trackStats.goldenRoads || 0,       c: '#fde047', icon: 'crown' },
        { label: 'Cafe',         value: $trackStats.cafeWins || 0,          c: '#4ade80', icon: 'coffee' },
        { label: 'Splits',       value: $trackStats.splitsCompleted || 0,   c: '#a78bfa', icon: 'calendar' },
        { label: 'Tower best',   value: $trackStats.towerHighestFloor || 0, c: '#f87171', icon: 'tower' },
        { label: 'Packs',        value: $trackStats.packs || 0,             c: '#e879f9', icon: 'store' },
        { label: 'Cards sold',   value: $trackStats.soldCount || 0,         c: '#94a3b8', icon: 'coins' },
    ];

    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };
    $: bpTier = $battlePass.tier || 0;
</script>

<section class="home" style="--tc: {teamColor}; --tc-rgb: {teamRgb};">
    <!-- ═══ HERO ═══ -->
    <div class="hero">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-id">
            <button class="hero-logo" on:click={startEdit} title="Edit team identity">
                <span class="hl-emoji">{$teamIdentity.logo}</span>
                <span class="hl-edit"><Icon name="palette" size={13} /></span>
            </button>
            <div class="hero-text">
                <span class="hero-kicker">
                    <span class="hk-title">{prestigeTitle}</span>
                    <span class="hk-dot">·</span> Manager Lv {$managerLevel}
                    {#if $prestige > 0}<span class="hk-dot">·</span> <span class="hk-prestige"><Icon name="star" size={11} stroke={2.2} /> Prestige {$prestige}</span>{/if}
                </span>
                <h1 class="hero-name">{$teamIdentity.name}</h1>
                <div class="hero-xp">
                    <div class="hx-track"><div class="hx-fill" style="width: {xpPct}%;"></div></div>
                    <span class="hx-text">{$managerXP.toLocaleString()} / {xpNeed.toLocaleString()} XP</span>
                </div>
                {#if $currentUser}<span class="hero-user"><Icon name="user" size={11} /> {$currentUser.displayName || $currentUser.email}</span>{/if}
            </div>
        </div>

        <div class="hero-stats">
            <div class="hs"><span class="hs-ico hs-be"><Icon name="gem" size={16} /></span><span class="hs-val">{$blueEssence.toLocaleString()}</span><span class="hs-lbl">Blue Essence</span></div>
            <div class="hs"><span class="hs-ico hs-cards"><Icon name="cards" size={16} /></span><span class="hs-val">{$club.length}</span><span class="hs-lbl">Cards</span></div>
            <div class="hs"><span class="hs-ico hs-power"><Icon name="bolt" size={16} /></span><span class="hs-val">{starters.length === 5 ? avgRating : '—'}</span><span class="hs-lbl">Squad avg</span></div>
            <div class="hs"><span class="hs-ico hs-tro"><Icon name="trophy" size={16} /></span><span class="hs-val">{$weightedTrophies}</span><span class="hs-lbl">Achievement</span></div>
        </div>

        <button class="hero-cta" on:click={() => switchTab(nextStep.tab)} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}>
            <span class="hc-ico"><Icon name={nextStep.icon} size={22} /></span>
            <span class="hc-text">
                <span class="hc-kicker">Next up</span>
                <span class="hc-label">{nextStep.label}</span>
                <span class="hc-sub">{nextStep.sub}</span>
            </span>
            <Icon name="arrow" size={18} />
        </button>
    </div>

    <div class="cols">
        <!-- ═══ MAIN ═══ -->
        <div class="col-main">
            <!-- To do -->
            <section class="panel">
                <div class="ph">
                    <h2 class="ph-title"><Icon name="check" size={15} /> To do</h2>
                    <span class="ph-note">{todo.length ? `${todo.length} thing${todo.length === 1 ? '' : 's'} waiting` : 'All caught up'}</span>
                </div>
                {#if todo.length}
                    <div class="todo">
                        {#each todo as t (t.label)}
                            <button class="td" style="--c: {t.c};" on:click={() => switchTab(t.tab)} use:pressFx={{ color: `${t.c}44` }}>
                                <span class="td-ico"><Icon name={t.icon} size={18} /></span>
                                <span class="td-text">
                                    <span class="td-label">{t.label}</span>
                                    <span class="td-sub">{t.sub}</span>
                                </span>
                                <Icon name="chevron" size={16} />
                            </button>
                        {/each}
                    </div>
                {:else}
                    <div class="caught-up">
                        <span class="cu-ico"><Icon name="check" size={22} stroke={2.4} /></span>
                        <div>
                            <div class="cu-title">Nothing waiting on you</div>
                            <div class="cu-sub">Every reward is claimed. Go and win something.</div>
                        </div>
                        <button class="btn-soft" on:click={() => switchTab('tournament')}>Open Play <Icon name="arrow" size={14} /></button>
                    </div>
                {/if}
            </section>

            <!-- Squad -->
            <section class="panel">
                <div class="ph">
                    <h2 class="ph-title"><Icon name="squad" size={15} /> Active squad</h2>
                    <button class="ph-link" on:click={() => switchTab('squad')}>Edit squad <Icon name="chevron" size={13} /></button>
                </div>
                <div class="squad">
                    {#each ['TOP','JNG','MID','ADC','SUP','COACH'] as role}
                        {@const c = $squad[role]}
                        <button class="sq" class:sq-empty={!c} class:sq-coach={role === 'COACH'} style="--q: {c ? (TIER_COLORS[c.quality] || '#64748b') : '#334155'};" on:click={() => switchTab('squad')}>
                            <span class="sq-role"><img src={ROLE_ICONS[role]} alt="" class="sq-role-img"> {role}</span>
                            {#if c}
                                <span class="sq-rating">{getEffectiveRating(c)}</span>
                                <span class="sq-name">{c.name}</span>
                                <span class="sq-meta">{c.team} · {c.year}</span>
                            {:else}
                                <span class="sq-plus">+</span>
                                <span class="sq-meta">Empty</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            </section>

            <div class="two">
                <!-- Milestones -->
                <section class="panel">
                    <div class="ph"><h2 class="ph-title"><Icon name="target" size={15} /> Next goals</h2></div>
                    {#if milestones.length === 0}
                        <div class="empty">Every milestone on the list is done.</div>
                    {:else}
                        <div class="goals">
                            {#each milestones as m}
                                <div class="goal">
                                    <div class="goal-top"><span class="goal-label">{m.label}</span><span class="goal-count">{m.current}/{m.target}</span></div>
                                    <div class="bar"><div class="bar-fill" style="width: {Math.min(100, (m.current / m.target) * 100)}%;"></div></div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </section>

                <!-- Recent matches -->
                <section class="panel">
                    <div class="ph"><h2 class="ph-title"><Icon name="swords" size={15} /> Recent matches</h2></div>
                    {#if recentMatches.length === 0}
                        <div class="empty">No matches played yet.</div>
                    {:else}
                        <div class="rm-list">
                            {#each recentMatches as mt}
                                <div class="rm-row">
                                    <span class="rm-result rm-{mt.result}">{resultLabel(mt.result)}</span>
                                    <span class="rm-icon"><Icon name={modeIcon(mt.mode)} size={15} /></span>
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
                    {/if}
                </section>
            </div>

            <!-- Recently acquired -->
            {#if recentCards.length > 0}
            <section class="panel">
                <div class="ph">
                    <h2 class="ph-title"><Icon name="cards" size={15} /> Recently acquired</h2>
                    <button class="ph-link" on:click={() => switchTab('club')}>Open club <Icon name="chevron" size={13} /></button>
                </div>
                <div class="recent-cards">
                    {#each recentCards as card (card.uniqueId)}
                        <Card {card} mini={true} />
                    {/each}
                </div>
            </section>
            {/if}

            <div class="two">
                <!-- Collection -->
                <section class="panel">
                    <div class="ph">
                        <h2 class="ph-title"><Icon name="archive" size={15} /> Collection</h2>
                        <div class="seg">
                            <button class:seg-on={collectionView === 'tiers'} on:click={() => collectionView = 'tiers'}>Tiers</button>
                            <button class:seg-on={collectionView === 'legacy'} on:click={() => collectionView = 'legacy'}>Legacy</button>
                        </div>
                    </div>
                    {#if collectionRows.length === 0}
                        <div class="empty">{collectionView === 'tiers' ? 'No cards yet' : 'No legacy cards yet — win tournaments to earn them.'}</div>
                    {:else}
                        <div class="tiers">
                            {#each collectionRows as { tier, count }}
                                <div class="tier-row" style="--q: {TIER_COLORS[tier] || '#64748b'};">
                                    <span class="tier-name">{tier}</span>
                                    <div class="tier-track"><div class="tier-fill" style="width: {(count / collectionMax) * 100}%;"></div></div>
                                    <span class="tier-count">{count}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                    <div class="coll-foot">{holoCount} holographic · {sigCount} signature</div>
                </section>

                <!-- Trophy cabinet -->
                <section class="panel">
                    <div class="ph"><h2 class="ph-title"><Icon name="trophy" size={15} /> Trophy cabinet</h2></div>
                    <div class="cabinet">
                        {#each cabinet as s}
                            <div class="cab" class:cab-zero={!s.value} style="--c: {s.c};">
                                <span class="cab-ico"><Icon name={s.icon} size={14} /></span>
                                <span class="cab-val">{s.value}</span>
                                <span class="cab-lbl">{s.label}</span>
                            </div>
                        {/each}
                    </div>
                </section>
            </div>
        </div>

        <!-- ═══ SIDE ═══ -->
        <aside class="col-side">
            <!-- Season -->
            <button class="panel side-card sc-season" on:click={() => switchTab('season')}>
                <div class="ph"><h2 class="ph-title"><Icon name="calendar" size={15} /> Season · {hSplit.name} split</h2>{#if hRow}<span class="ph-note">{hRow.w}W – {hRow.l}L · {hRow.pos}{hRow.pos === 1 ? 'st' : hRow.pos === 2 ? 'nd' : hRow.pos === 3 ? 'rd' : 'th'}</span>{/if}</div>
                {#if nextSeasonOpp && seasonSplitActive}
                    <div class="ng">
                        <span class="ng-num">{sdh.stage === 'playoffs' ? 'RT' : `#${hPlayed + 1}`}</span>
                        <span class="ng-name">{nextSeasonOpp.name}</span>
                        <span class="ng-pwr">{nextSeasonOpp.avgRating}</span>
                    </div>
                    <span class="side-link">Continue split <Icon name="chevron" size={13} /></span>
                {:else}
                    <div class="side-idle">{sdh.stage === 'done' ? 'Split over — rewards waiting' : hQualified ? `Qualified for ${hQualified.eventName}!` : 'No split in progress'}</div>
                    <span class="side-link">Go to Season <Icon name="chevron" size={13} /></span>
                {/if}
            </button>

            <!-- Ranking -->
            <button class="panel side-card sc-rank" on:click={() => switchTab('leaderboard')}>
                <div class="ph"><h2 class="ph-title"><Icon name="ranking" size={15} /> Your ranking</h2></div>
                <div class="rank-title">{prestigeTitle}</div>
                <div class="rank-tp">Achievement Score {$weightedTrophies}</div>
                {#if nextTitleThreshold}
                    <div class="bar bar-gold"><div class="bar-fill" style="width: {Math.min(100, ($weightedTrophies / nextTitleThreshold) * 100)}%;"></div></div>
                    <div class="rank-next">{nextTitleThreshold - $weightedTrophies} more to <b>{getTitle(nextTitleThreshold)}</b></div>
                {:else}
                    <div class="rank-next">Top title reached</div>
                {/if}
            </button>

            <!-- Battle pass -->
            <button class="panel side-card sc-bp" on:click={() => switchTab('rewards')}>
                <div class="ph"><h2 class="ph-title"><Icon name="star" size={15} /> Battle Pass</h2><span class="ph-note">Season {$battlePass.season}</span></div>
                <div class="bp-row"><span class="bp-tier">Tier {bpTier}</span><span class="bp-of">/ {MAX_TIER}</span></div>
                <div class="bar bar-bp"><div class="bar-fill" style="width: {Math.min(100, (($battlePass.xp || 0) / XP_PER_TIER) * 100)}%;"></div></div>
                <span class="side-link">{$badges.battlePass ? `${$badges.battlePass} reward${$badges.battlePass === 1 ? '' : 's'} to claim` : 'View rewards'} <Icon name="chevron" size={13} /></span>
            </button>

            <!-- Best card -->
            {#if bestCard}
            <section class="panel side-card">
                <div class="ph"><h2 class="ph-title"><Icon name="sparkle" size={15} /> Best card</h2></div>
                <div class="best"><Card card={bestCard} mini={true} /></div>
            </section>
            {/if}

            {#if $milestoneCards.length > 0}
            <section class="panel side-card">
                <div class="ph"><h2 class="ph-title"><Icon name="sparkle" size={15} /> Milestone cards</h2></div>
                <div class="mc-list">
                    {#each $milestoneCards as mc}
                        <div class="mc"><Icon name="star" size={14} /> <span class="mc-name">{mc.name}</span><span class="mc-r">{mc.rating}</span></div>
                    {/each}
                </div>
            </section>
            {/if}

            <!-- Coming soon -->
            <section class="panel side-card sc-soon">
                <div class="ph"><h2 class="ph-title"><Icon name="clock" size={15} /> Coming soon</h2></div>
                <div class="soon"><b>Retro Cup</b> — an era- and region-locked tournament: build a themed squad and face rosters from the same pool.</div>
                <div class="soon"><b>2021–2023 Rosters</b> — regular-season cards filling the gap between 2020 and the 2024+ rosters.</div>
                <button class="ph-link" on:click={() => switchTab('guide')}>New here? Read the guide <Icon name="chevron" size={13} /></button>
            </section>
        </aside>
    </div>
</section>

<!-- Identity editor -->
{#if editing}
<!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="ov" on:click={cancelEdit}>
    <div class="ed" on:click|stopPropagation style="--tc: {editColor};">
        <button class="ed-close" on:click={cancelEdit} aria-label="Close">✕</button>
        <h3 class="ed-title">Team identity</h3>
        <div class="ed-preview">
            <span class="ed-logo">{editLogo}</span>
            <span class="ed-name">{editName || 'My Team'}</span>
        </div>
        <label class="ed-label" for="ed-name">Name</label>
        <input id="ed-name" type="text" bind:value={editName} maxlength="20" class="input ed-input">
        <div class="ed-label">Crest</div>
        <div class="icon-grid">
            {#each availableIcons as icon}
                <button class="icon-opt" class:icon-sel={editLogo === icon} on:click={() => editLogo = icon}>{icon}</button>
            {/each}
        </div>
        <div class="ed-label">Colour</div>
        <div class="color-grid">
            {#each availableColors as c}
                <button class="color-opt" class:color-sel={editColor === c} style="background: {c};" on:click={() => editColor = c} aria-label="Colour {c}"></button>
            {/each}
        </div>
        <p class="ed-hint">More crests and colours unlock on the Battle Pass.</p>
        <div class="ed-btns">
            <button class="btn-primary" on:click={saveEdit}>Save</button>
            <button class="btn-secondary" on:click={cancelEdit}>Cancel</button>
        </div>
    </div>
</div>
{/if}

<style>
    .home { padding-bottom: 40px; display: flex; flex-direction: column; gap: 20px; }

    /* ═══ HERO ═══ */
    .hero {
        position: relative; overflow: hidden;
        display: grid; grid-template-columns: minmax(0, 1.3fr) auto minmax(260px, 0.8fr); align-items: center; gap: 26px;
        padding: 26px 30px; border-radius: 26px;
        background:
            radial-gradient(70% 140% at 0% 0%, rgba(var(--tc-rgb), 0.32), transparent 60%),
            linear-gradient(120deg, #0f1428 0%, #0b0f1d 60%, #0a0d18 100%);
        border: 1px solid rgba(var(--tc-rgb), 0.3);
        box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    .hero-glow { position: absolute; right: -10%; top: -60%; width: 50%; height: 220%; background: radial-gradient(circle, rgba(var(--tc-rgb), 0.12), transparent 60%); pointer-events: none; }
    .hero-id { position: relative; display: flex; align-items: center; gap: 20px; min-width: 0; }
    .hero-logo {
        position: relative; flex-shrink: 0; width: 92px; height: 92px; border-radius: 28px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 35% 30%, rgba(var(--tc-rgb), 0.55), rgba(var(--tc-rgb), 0.12) 70%), #0b1020;
        border: 2px solid rgba(var(--tc-rgb), 0.6);
        box-shadow: 0 0 0 6px rgba(var(--tc-rgb), 0.08), 0 10px 30px rgba(var(--tc-rgb), 0.3);
    }
    .hero-logo:hover { transform: translateY(-2px) rotate(-3deg); }
    .hl-emoji { font-size: 48px; line-height: 1; }
    .hl-edit { position: absolute; right: -6px; bottom: -6px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; background: var(--tc); border: 3px solid #0b0f1d; }
    .hero-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .hero-kicker { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .hk-title { color: #fbbf24; }
    .hk-dot { color: #475569; }
    .hk-prestige { display: inline-flex; align-items: center; gap: 3px; color: #fde68a; }
    .hero-name { font-size: clamp(26px, 3vw, 38px); font-weight: 900; color: #fff; letter-spacing: -0.5px; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hero-xp { display: flex; align-items: center; gap: 10px; margin-top: 4px; max-width: 420px; }
    .hx-track { flex: 1; height: 8px; border-radius: 8px; background: rgba(15,23,42,0.85); overflow: hidden; border: 1px solid rgba(255,255,255,0.06); }
    .hx-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, rgba(var(--tc-rgb), 0.7), var(--tc)); box-shadow: 0 0 10px rgba(var(--tc-rgb), 0.6); transition: width 0.5s; }
    .hx-text { font-size: 11px; font-weight: 800; color: #94a3b8; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .hero-user { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #818cf8; }

    .hero-stats { position: relative; display: grid; grid-template-columns: repeat(2, minmax(110px, 1fr)); gap: 8px; }
    .hs { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 9px; align-items: center; padding: 9px 12px; border-radius: 14px; background: rgba(2,6,23,0.45); border: 1px solid rgba(148,163,184,0.12); }
    .hs-ico { grid-row: 1 / span 2; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .hs-be { color: #7dd3fc; background: rgba(56,189,248,0.12); }
    .hs-cards { color: #c4b5fd; background: rgba(167,139,250,0.12); }
    .hs-power { color: #6ee7b7; background: rgba(52,211,153,0.12); }
    .hs-tro { color: #fcd34d; background: rgba(251,191,36,0.12); }
    .hs-val { font-size: 17px; font-weight: 900; color: #f1f5f9; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .hs-lbl { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }

    .hero-cta {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px; text-align: left; cursor: pointer;
        padding: 18px 20px; border-radius: 20px; color: #fff;
        background: radial-gradient(160px 120px at var(--mx, 20%) var(--my, 30%), rgba(255,255,255,0.18), transparent 70%), linear-gradient(135deg, #4f46e5, #6d28d9);
        border: 1px solid rgba(196,181,253,0.4);
        box-shadow: 0 12px 30px rgba(79,70,229,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
    }
    .hero-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 38px rgba(79,70,229,0.5), inset 0 1px 0 rgba(255,255,255,0.25); }
    .hc-ico { position: relative; z-index: 1; width: 46px; height: 46px; flex-shrink: 0; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.16); }
    .hc-text { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .hc-kicker { font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #c7d2fe; }
    .hc-label { font-size: 16px; font-weight: 900; }
    .hc-sub { font-size: 11px; color: #ddd6fe; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ═══ COLUMNS ═══ */
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; align-items: start; }
    .col-main, .col-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }

    .panel {
        padding: 18px; border-radius: 20px; text-align: left;
        background: linear-gradient(160deg, rgba(var(--tc-rgb), 0.07), rgba(11,15,28,0.75) 45%);
        border: 1px solid rgba(100,116,139,0.2);
    }
    .ph { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
    .ph-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; color: #cbd5e1; }
    .ph-title :global(svg) { color: var(--tc); }
    .ph-note { font-size: 11px; font-weight: 700; color: #64748b; }
    .ph-link { display: inline-flex; align-items: center; gap: 3px; background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 800; color: #93c5fd; }
    .ph-link:hover { color: #dbeafe; }
    .empty { font-size: 12px; color: #475569; font-style: italic; padding: 10px 0; }

    /* To do */
    .todo { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
    .td {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer;
        padding: 11px 12px; border-radius: 14px; color: #64748b;
        background: color-mix(in srgb, var(--c) 7%, rgba(15,23,42,0.6));
        border: 1px solid color-mix(in srgb, var(--c) 22%, transparent);
    }
    .td:hover { border-color: color-mix(in srgb, var(--c) 55%, transparent); color: var(--c); transform: translateY(-1px); }
    .td-ico { position: relative; z-index: 1; width: 38px; height: 38px; flex-shrink: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .td-text { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .td-label { font-size: 13px; font-weight: 800; color: #f1f5f9; }
    .td-sub { font-size: 11px; color: #7c8aa0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .caught-up { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 6px 2px; }
    .cu-ico { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #34d399; background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.3); }
    .cu-title { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .cu-sub { font-size: 12px; color: #64748b; }
    .btn-soft { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 12px; cursor: pointer; font-size: 12px; font-weight: 900; color: #e0e7ff; background: rgba(99,102,241,0.18); border: 1px solid rgba(129,140,248,0.35); }
    .btn-soft:hover { background: rgba(99,102,241,0.3); }

    /* Squad */
    .squad { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .sq {
        position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer;
        padding: 10px 6px 10px; border-radius: 14px; text-align: center;
        background: linear-gradient(180deg, color-mix(in srgb, var(--q) 22%, #0d1222), #0b0f1c 80%);
        border: 1px solid color-mix(in srgb, var(--q) 40%, transparent);
    }
    .sq::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--q); }
    .sq:hover { transform: translateY(-2px); border-color: var(--q); }
    .sq-role { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 900; letter-spacing: 1px; color: #94a3b8; }
    .sq-role-img { width: 12px; height: 12px; opacity: 0.85; }
    .sq-rating { font-size: 24px; font-weight: 900; color: #fff; line-height: 1.1; margin-top: 2px; }
    .sq-name { font-size: 12px; font-weight: 800; color: #e2e8f0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sq-meta { font-size: 9.5px; color: #64748b; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sq-empty { border-style: dashed; background: rgba(15,23,42,0.4); }
    .sq-plus { font-size: 24px; font-weight: 900; color: #334155; line-height: 1.1; margin-top: 2px; }
    .sq-coach { opacity: 0.92; }

    /* Goals */
    .goals { display: flex; flex-direction: column; gap: 12px; }
    .goal-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
    .goal-label { font-size: 12px; font-weight: 700; color: #cbd5e1; }
    .goal-count { font-size: 11px; font-weight: 800; color: #64748b; font-variant-numeric: tabular-nums; }
    .bar { height: 6px; border-radius: 6px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, rgba(var(--tc-rgb), 0.6), var(--tc)); transition: width 0.5s; }
    .bar-gold .bar-fill { background: linear-gradient(90deg, #d97706, #fbbf24); }
    .bar-bp .bar-fill { background: linear-gradient(90deg, #7c3aed, #c084fc); }

    /* Recent matches */
    .rm-list { display: flex; flex-direction: column; gap: 6px; }
    .rm-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(15,23,42,0.45); }
    .rm-result { flex: 0 0 auto; min-width: 32px; text-align: center; font-size: 11px; font-weight: 900; padding: 3px 6px; border-radius: 7px; }
    .rm-win { background: rgba(52,211,153,0.15); color: #34d399; }
    .rm-loss { background: rgba(248,113,113,0.12); color: #f87171; }
    .rm-finalist { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .rm-icon { color: #94a3b8; display: flex; }
    .rm-info { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
    .rm-mode { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .rm-opp { font-size: 10.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rm-rewards { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; }
    .rm-be { font-size: 10.5px; font-weight: 800; color: #34d399; }
    .rm-time { font-size: 9.5px; color: #475569; }

    .recent-cards { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
    /* Scroll sideways rather than squash: a flex child shrinks by default. */
    .recent-cards > :global(.card) { flex-shrink: 0; }

    /* Side */
    .side-card { width: 100%; }
    button.side-card { cursor: pointer; display: block; transition: border-color 0.15s, transform 0.15s; }
    button.side-card:hover { border-color: rgba(var(--tc-rgb), 0.5); transform: translateY(-1px); }
    button.side-card:active { transform: scale(0.99); }
    .side-link { display: inline-flex; align-items: center; gap: 3px; margin-top: 10px; font-size: 11px; font-weight: 800; color: #93c5fd; }
    .side-idle { font-size: 12px; color: #64748b; font-style: italic; }
    .ng { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(30,58,138,0.18); border: 1px solid rgba(59,130,246,0.2); }
    .ng-num { font-size: 11px; font-weight: 900; color: #60a5fa; }
    .ng-name { flex: 1; font-size: 13px; font-weight: 800; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ng-pwr { font-size: 13px; font-weight: 900; color: #f87171; }
    .rank-title { font-size: 24px; font-weight: 900; color: #fbbf24; line-height: 1.1; }
    .rank-tp { font-size: 12px; color: #94a3b8; margin: 2px 0 10px; }
    .rank-next { font-size: 11px; color: #64748b; margin-top: 6px; }
    .rank-next b { color: #fcd34d; }
    .bp-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
    .bp-tier { font-size: 24px; font-weight: 900; color: #e9d5ff; }
    .bp-of { font-size: 12px; font-weight: 800; color: #64748b; }
    .best { display: flex; justify-content: center; }

    .seg { display: inline-flex; padding: 2px; border-radius: 9px; background: rgba(15,23,42,0.8); border: 1px solid rgba(71,85,105,0.3); }
    .seg button { padding: 4px 10px; border-radius: 7px; border: none; background: none; cursor: pointer; font-size: 10px; font-weight: 900; color: #64748b; }
    .seg .seg-on { background: rgba(var(--tc-rgb), 0.22); color: #f1f5f9; }
    .tiers { display: flex; flex-direction: column; gap: 6px; }
    .tier-row { display: grid; grid-template-columns: 86px 1fr 30px; align-items: center; gap: 8px; }
    .tier-name { font-size: 11px; font-weight: 800; color: var(--q); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tier-track { height: 7px; border-radius: 7px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .tier-fill { height: 100%; border-radius: 7px; background: var(--q); min-width: 3px; transition: width 0.5s; }
    .tier-count { font-size: 11px; font-weight: 800; color: #94a3b8; text-align: right; }
    .coll-foot { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(71,85,105,0.2); font-size: 11px; color: #64748b; text-align: center; }

    .cabinet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .cab { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: center; padding: 8px 10px; border-radius: 12px; background: color-mix(in srgb, var(--c) 8%, rgba(15,23,42,0.6)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent); }
    .cab-ico { grid-row: 1 / span 2; color: var(--c); display: flex; }
    .cab-val { font-size: 16px; font-weight: 900; color: #f1f5f9; line-height: 1.1; }
    .cab-lbl { font-size: 9.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .cab-zero { opacity: 0.55; }

    .mc-list { display: flex; flex-direction: column; gap: 6px; }
    .mc { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 10px; background: rgba(251,191,36,0.07); color: #fbbf24; }
    .mc-name { flex: 1; font-size: 12px; font-weight: 800; }
    .mc-r { font-size: 12px; font-weight: 900; }
    .sc-soon .ph-link { margin-top: 6px; }
    .soon { font-size: 11.5px; color: #7c8aa0; line-height: 1.5; margin-bottom: 8px; }
    .soon b { color: #c4b5fd; }

    /* Identity editor */
    .ov { position: fixed; inset: 0; z-index: 85; background: rgba(2,4,12,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px; }
    .ed { position: relative; width: 100%; max-width: 420px; max-height: 92vh; overflow-y: auto; padding: 24px; border-radius: 22px; background: linear-gradient(170deg, #0f1428, #0a0e1a); border: 1px solid color-mix(in srgb, var(--tc) 40%, transparent); box-shadow: 0 30px 80px rgba(0,0,0,0.6); }
    .ed-close { position: absolute; top: 12px; right: 14px; width: 32px; height: 32px; border-radius: 10px; background: rgba(51,65,85,0.35); border: 1px solid rgba(71,85,105,0.25); color: #94a3b8; cursor: pointer; }
    .ed-title { font-size: 18px; font-weight: 900; color: #f1f5f9; margin-bottom: 14px; }
    .ed-preview { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 16px; margin-bottom: 14px; background: radial-gradient(circle at 0% 50%, color-mix(in srgb, var(--tc) 35%, transparent), transparent 70%), rgba(15,23,42,0.6); border: 1px solid color-mix(in srgb, var(--tc) 45%, transparent); }
    .ed-logo { font-size: 36px; }
    .ed-name { font-size: 18px; font-weight: 900; color: #fff; }
    .ed-label { display: block; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin: 12px 0 7px; }
    .ed-input { width: 100%; }
    .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; }
    .icon-opt { aspect-ratio: 1; border-radius: 12px; font-size: 22px; background: rgba(15,23,42,0.5); border: 2px solid transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .icon-opt:hover { background: rgba(30,41,59,0.7); }
    .icon-sel { border-color: var(--tc) !important; background: color-mix(in srgb, var(--tc) 18%, transparent) !important; }
    .color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 6px; }
    .color-opt { aspect-ratio: 1; border-radius: 10px; border: 2px solid transparent; cursor: pointer; }
    .color-opt:hover { transform: scale(1.08); }
    .color-sel { border-color: #fff !important; box-shadow: 0 0 12px rgba(255,255,255,0.25); }
    .ed-hint { font-size: 11px; color: #64748b; margin-top: 12px; }
    .ed-btns { display: flex; gap: 8px; margin-top: 16px; }
    .ed-btns button { flex: 1; }

    @media (max-width: 1300px) {
        .hero { grid-template-columns: minmax(0, 1fr) minmax(240px, 0.8fr); }
        .hero-stats { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-row: 2; }
        .cols { grid-template-columns: minmax(0, 1fr) 300px; }
    }
    @media (max-width: 1020px) {
        .cols { grid-template-columns: 1fr; }
        .col-side { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        .squad { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 760px) {
        .hero { grid-template-columns: 1fr; padding: 20px; gap: 16px; }
        .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-row: auto; }
        .hero-logo { width: 72px; height: 72px; border-radius: 22px; }
        .hl-emoji { font-size: 38px; }
        .two { grid-template-columns: 1fr; }
    }
</style>
