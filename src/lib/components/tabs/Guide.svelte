<script>
    let openSection = 'getting-started';
    function toggle(id) { openSection = openSection === id ? null : id; }

    const sections = [
        { id: 'getting-started', title: '🎮 Getting Started', content: [
            { q: 'How do I start?', a: 'Claim your free Starter Pack from the Store (6 cards, one per role). Assign them to your Squad, then enter the Gaming Cafe Tournament from the Play menu.' },
            { q: 'What is Blue Essence (BE)?', a: 'BE is the in-game currency. Earn it from tournaments, season splits, daily login, quests, and selling cards. Spend it on packs, trade refreshes, and more.' },
            { q: 'How do I save my progress?', a: 'Local progress saves automatically to your browser. Sign in with an account to save to the cloud and sync across devices. Auto-save runs every 10 minutes when signed in.' },
        ]},
        { id: 'cards', title: '🃏 Cards & Tiers', content: [
            { q: 'Card Tiers (lowest to highest)', a: 'Bronze → Silver → Gold → Platinum → Diamond → Master → Grandmaster → Challenger. Special tiers: Champion, MVP, Finalist, MSI, FirstStand, POTY, ROTY, TOTY, GPOTY, X.' },
            { q: 'Card Stats', a: 'Each card has 6 stats: MEC (Mechanics), TMF (Teamfight), FRM (Form), CMP (Composure), MAP (Macro), LDR (Leadership). These determine combat performance.' },
            { q: 'Signature Cards (+2 all stats, +2 rating)', a: 'Extremely rare (0.1% per card). Adds +2 to all 6 stats and +2 to the card rating. Has a golden glow effect. Can stack with Holographic.' },
            { q: 'Holographic Cards (+1 all stats, +1 rating)', a: 'Rare (1% per card). Adds +1 to all 6 stats and +1 to the card rating. Has a rainbow outline effect. Can stack with Signature for +3 total.' },
            { q: 'Locking & Favouriting', a: 'Lock cards to prevent accidental selling or trading. Favourite cards to sort them to the top of your club. Both can be done from the Club tab or Card Detail view.' },
        ]},
        { id: 'store', title: '📦 Store & Packs', content: [
            { q: 'Pack Types', a: 'Standard (100 BE) — up to Gold. Premium (600 BE) — up to Diamond. Elite (1,000 BE) — up to Master. First Stand (3,000 BE) — up to FirstStand. MSI (5,000 BE) — up to MSI. Champion (6,000 BE) — up to Champion. MVP (8,000 BE) — up to MVP.' },
            { q: 'Drop Rates', a: 'Each pack has different drop percentages. Click "Preview" on any pack to see exact rates. Top-tier cards in special packs have 0.5% drop chance. Signature is always 0.1%, Holographic is always 1%.' },
            { q: 'Scouting Skill', a: 'The Scouting Network skill improves your pack luck by +0.25% per level. Check the preview modal to see your current bonus.' },
        ]},
        { id: 'squad', title: '👥 Squad Building', content: [
            { q: 'Squad Positions', a: 'Fill TOP, JNG, MID, ADC, SUP (5 starters) + optional COACH. All 5 starters are needed to compete in any tournament or season match.' },
            { q: 'Total Power', a: 'Total Power = Average Rating + Region Chemistry + Year Chemistry + Team Chemistry + Coach Bonus + Legacy Bonus. This is your combat strength.' },
            { q: 'Chemistry Bonuses', a: 'Region: Same region gives up to +5. Era: Same era gives up to +5 (Eras: 2011-13, 2014-16, 2017-19, 2020-22, 2023-25, 2026+). Team: Full same-team gives +2. Coach: Higher-rated coach gives +1 to +5. Legacy tier cards bypass era/region as wildcards.' },
            { q: 'Auto Fill', a: 'The Auto Fill button picks the best cards by total stat sum for each role from your club.' },
            { q: 'Stat Comparison', a: 'When picking cards in the squad builder, you see a stat comparison panel showing the difference vs your current card for each stat.' },
        ]},
        { id: 'combat', title: '⚔️ Combat System', content: [
            { q: 'How combat works', a: 'Each round, 3 random plays are drawn from 5 stats (Mechanical, Teamfight, Macro, Form, Composure). Pick one — your team average in that stat is compared to the CPU\'s. The stat difference is added to your Total Power vs their rating, plus random variance (±5).' },
            { q: 'Formula', a: 'Your Score = Total Power + (Your Stat Avg - CPU Stat Avg) + Random(±5). CPU Score = CPU Rating + Random(±5). Higher score wins the round.' },
            { q: 'Best of 3 / Best of 5', a: 'Tournament matches are best-of-3 (first to 2 wins). Season matches are best-of-5 (first to 3 wins).' },
            { q: 'Cards on screen', a: 'During combat, both teams\' cards are displayed on either side of the play area in a 2×3 grid (TOP+COACH, JNG+MID, ADC+SUP).' },
        ]},
        { id: 'tournaments', title: '🏆 Tournaments', content: [
            { q: 'Gaming Cafe (Always available)', a: '3 rounds, CPU capped at Gold tier. Free entry. Win: 300 BE, 2nd: 150 BE.' },
            { q: 'Regional Trophy (Complete 1 Season Split)', a: '5 rounds, mixed tiers. Win: 1,500 BE, 2nd: 500 BE. Winning/2nd unlocks First Stand.' },
            { q: 'First Stand (Win/2nd Regional)', a: '5 rounds, tough opponents. Win: 3,000 BE, 2nd: 1,000 BE. Winning unlocks MSI.' },
            { q: 'MSI (Win First Stand or Regional)', a: '7 rounds, elite competition. Win: 5,000 BE, 2nd: 2,000 BE. Winning unlocks Worlds.' },
            { q: 'World Championship (Win Regional or MSI)', a: '7 rounds, the ultimate challenge. Win: 10,000 BE, 2nd: 4,000 BE.' },
            { q: 'Golden Road (Complete 1 Split)', a: 'Win Regional → First Stand → MSI → Worlds in sequence without losing ANY match. Fail once and it\'s over. Reward: 25,000 BE.' },
        ]},
        { id: 'season', title: '📅 Season Splits', content: [
            { q: 'How Season Splits work', a: '10 matches per split against CPU teams of increasing difficulty. You must play them in order. Win 6+ to earn a Regional Trophy.' },
            { q: 'Split Rewards', a: 'Perfect Split (10W): 5,000 BE. Dominant (9W): 3,500 BE. Elite (8W): 2,500 BE. Playoff (7W): 1,800 BE. Down to Participation (0-3W): 200 BE.' },
            { q: 'Death Splits', a: 'Each split generates 1-6 HARD teams (rating 88-100) and 0-2 BOSS teams (rating 110-120). BOSS teams are near-impossible to beat.' },
            { q: 'Team Meta & Slumps', a: 'Each split has 2 meta phases (games 1-5 and 6-10). 5 teams are buffed (+8 to +20 all stats) and 12 teams are nerfed/slumping (-10 to -30). Only your affected squad members are shown. Plan your roster around the meta!' },
            { q: 'Squad Lock & Bench Swaps', a: 'Your squad is locked when a split starts. Upgrade the Bench Management skill to unlock mid-split player swaps (1 swap per skill level, max 5). Use swaps to react to meta shifts and slumps.' },
        ]},
        { id: 'progression', title: '⭐ Progression', content: [
            { q: 'Manager Level & XP', a: 'Earn XP from packs (+50), wins (+200), and trades (+25). Each level grants 1 Skill Point. XP needed per level = Level × 500.' },
            { q: 'Skill Tree', a: 'Scouting (pack odds), Tactics (combat boost +1/level), Transfer (sell value), Conditioning (chemistry), Stamina (split cooldown -10s/level), Mentorship (XP gain +10%/level), Trade Mastery (trade slots/discounts), Bench Management (mid-split swaps), Club Capacity (+50 cards/level).' },
            { q: 'Manager Titles', a: 'Scout (0 TP) → Manager (10) → Director (30) → GM (75) → Executive (150) → President (250) → Hall of Fame (400) → Legend (600) → Immortal (1,000). Earn Trophy Points from tournament wins.' },
            { q: 'Trophy Points', a: 'Worlds win: ×6. MSI win: ×4. First Stand win: ×2. Regional win: ×1. Golden Road: ×10.' },
        ]},
        { id: 'rewards', title: '🎁 Rewards', content: [
            { q: 'Daily Login', a: '28-day cycle of rewards including BE, cards (Silver to Diamond), Skill Points, and Battle Pass XP. Claim once per day. Cycles repeat after 28 days.' },
            { q: 'Battle Pass', a: '100 tiers of rewards. Earn XP from matches, pack opens, daily login, and quests. Rewards include BE, Skill Points, team icons, team colors, and cards up to Grandmaster. Tiers 96-100 are repeatable.' },
            { q: 'Quests', a: 'Milestones: One-time goals across Collection, Economy, Competitive, and Progression categories. Contracts: Repeatable quests with infinite completions. Achievements: Live state checks (squad avg, club size, trophies).' },
        ]},
        { id: 'other', title: '🔧 Other Features', content: [
            { q: 'Trade Market', a: 'Trade lower-tier cards for higher-tier players. 3 base offers (up to 5 with Trade Mastery skill). Offers rotate every 15 minutes. Pay 1,000 BE to refresh early (discounted by skill).' },
            { q: 'Upgrade Lab', a: 'Combine multiple cards of the same role and tier to forge one higher-tier card. E.g. 10× Bronze → 1× Silver. Costs BE per upgrade.' },
            { q: 'Archive', a: 'Track your collection completion across all teams, regions, and special card categories. Cards you\'ve owned are permanently marked.' },
            { q: 'Leaderboard', a: 'Global rankings synced via Firebase. Compare trophies, power, splits, cards, and more. Click any player to view their full profile.' },
            { q: 'Cloud Save', a: 'Sign in to save/load progress across devices. Compatible with the old v1 website — all cards, squad, and stats transfer.' },
            { q: 'Settings', a: 'Theme (dark/light), sound toggle, and account wipe available in the account panel (top-right user icon).' },
        ]},
        { id: 'changelog', title: '📋 Update Log', content: [
            { q: 'Beta 1.0.9.2 — Latest', a: '• Card Showcase moved to Club Vault with drag-and-drop reordering\n• Add cards to showcase via ⭐ button on each card, remove with ✕ on hover\n• Squad fully locks during active season splits — no roster changes from club\n• Bench slots in Squad Builder: unlock up to 3 via Bench Management skill (max level 3)\n• Mid-split swaps only with bench players — click bench card, then select starter to swap\n• Bench Management skill visual colors added (teal theme)\n• Repeatable contracts now bulk-claim in one press (e.g. Claim ×5 · 1500 BE)\n• Combat UI overhaul: Power comparison bar, Stat vs Net split on play buttons\n• Full match log breakdown showing base + stat edge + luck roll per round\n• Upgrade Lab notification badges: per-path role count + green ready dots\n• Runner-up reward fixed: only awarded for semi-final or final loss\n• Leaderboard favourites: set your favourite team and player\n• Career record updated: added First Stand wins, Tower Best; removed Draft/Salary\n• Leaderboard autosync runs globally every 10 min (not just when on Board tab)\n• Battle Pass auto-levels — tiers advance automatically, just claim rewards\n• Redeem code system in Settings (try MSISIG2024 for a free MSI Signature card)\n• Season split infinite loop fix for later years\n• Season data validation for carried-over accounts\n• Player ratings updated for 2025-2026 based on real performance data\n• CFO2024 team name fixed to CFO (proper grouping in Archive)' },
            { q: 'Beta 1.0.9.1', a: '• Trades lock instantly after completing — no repeat claims\n• Quest sub-tabs show notification badges for claimable rewards\n• Repeatable contracts stack — excess progress carries over\n• Archive claim buttons moved inside sub-tabs\n• Battle Pass XP earned from all gameplay modes\n• Tactical Mastery bonus visibly applied in combat\n• Season split cooldown timer persists across tabs and page reloads\n• Header cooldown timer chip — click to jump to Season tab\n• Expanded meta: 5 buffed, 12 slumping teams per phase\n• CPU team generation enforces rating caps\n• Gaming Cafe capped at 78 power, Regional Trophy at 93\n• 39 milestones, 7 contracts, 17 achievements\n• Leaderboard shows other players\' squads and showcase\n• Archive rewards: per-card discovery + team completion\n• Notification badges on Archive, Quests, Skills, Rewards tabs' },
            { q: 'Beta 1.0.7', a: '• Era synergy replaces year synergy (6 eras grouping years into 3-year blocks)\n• Signature cards +2 all stats/rating, Holographic +1, stackable, can exceed 99\n• Pack preview shows exact drop rates with scouting bonus\n• 3-column combat layout with 2×3 card grids\n• Infinity Tower: endless floors, roguelike upgrades, persistent runs\n• Golden Road: 4-stage tournament gauntlet with 30-min cooldown\n• Trade Market with 15-min rotation and skill-based scaling\n• Daily Login (28-day cycle) and 100-tier Battle Pass\n• Manager XP system with central grantXP function across all modes' },
        ]},
    ];
</script>

<section class="guide">
    <div class="guide-head">
        <h2 class="guide-title">Game Guide</h2>
        <p class="guide-desc">Everything you need to know about LoL Ultimate Roster.</p>
    </div>

    <div class="guide-sections">
        {#each sections as section}
            <div class="guide-section" class:gs-open={openSection === section.id}>
                <button class="gs-header" on:click={() => toggle(section.id)}>
                    <span class="gs-title">{section.title}</span>
                    <span class="gs-arrow">{openSection === section.id ? '▾' : '▸'}</span>
                </button>
                {#if openSection === section.id}
                    <div class="gs-body">
                        {#each section.content as item}
                            <div class="gs-item">
                                <h4 class="gs-q">{item.q}</h4>
                                <p class="gs-a">{item.a}</p>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</section>

<style>
    .guide { max-width: 800px; margin: 0 auto; padding-bottom: 40px; }
    .guide-head { margin-bottom: 24px; }
    .guide-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .guide-desc { font-size: 12px; color: #64748b; margin-top: 3px; }

    .guide-sections { display: flex; flex-direction: column; gap: 6px; }
    .guide-section {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 14px; overflow: hidden;
    }
    .gs-open { border-color: rgba(59,130,246,0.15); }

    .gs-header {
        display: flex; justify-content: space-between; align-items: center;
        width: 100%; padding: 16px 20px; background: none; border: none;
        cursor: pointer; transition: background 0.1s;
    }
    .gs-header:hover { background: rgba(30,41,59,0.3); }
    .gs-title { font-size: 15px; font-weight: 900; color: #e2e8f0; }
    .gs-arrow { font-size: 14px; color: #475569; }

    .gs-body { padding: 0 20px 20px; }
    .gs-item {
        padding: 14px 0; border-bottom: 1px solid rgba(51,65,85,0.1);
    }
    .gs-item:last-child { border-bottom: none; }
    .gs-q { font-size: 13px; font-weight: 900; color: #93c5fd; margin-bottom: 6px; }
    .gs-a { font-size: 12px; color: #94a3b8; line-height: 1.7; }
</style>
