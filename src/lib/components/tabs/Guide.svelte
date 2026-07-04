<script>
    let openSection = 'getting-started';
    function toggle(id) { openSection = openSection === id ? null : id; }

    const COV_YEARS = ['2015','2016','2024','2025','2026'];
    const regionData = [
        { r: 'LCK', years: ['2015','2016','2024','2025','2026'], note: 'Full coverage' },
        { r: 'LPL', years: ['2015','2016','2024','2025','2026'], note: 'Full coverage' },
        { r: 'LEC', years: ['2015','2016','2024','2025','2026'], note: 'Full coverage' },
        { r: 'LCS', years: ['2016','2024','2025','2026'],        note: 'No 2015' },
        { r: 'LCP', years: ['2015','2016','2024','2025','2026'], note: 'Full coverage' },
    ];
    const specialData = [
        { type: 'Worlds Champion', quality: 'Champion', qc: 'champion', pack: 'Champion Pack',    years: '2011 – 2025 (every year)', teams: 'FNC · TPA · SKT ×5 · SSW · SSG · IG · FPX · DK · EDG · DRX · T1 ×3' },
        { type: 'Finals MVP',      quality: 'MVP',      qc: 'mvp',      pack: 'MVP Pack',         years: '2011 – 2025 (every year)', teams: 'One card per year — same winning team' },
        { type: 'Worlds Finalist', quality: 'Finalist', qc: 'finalist', pack: 'First Stand+',    years: '2015, 2016, 2023, 2024, 2025', teams: 'KOO · SSG · WBG · BLG · KT' },
        { type: 'MSI Champion',    quality: 'MSI',      qc: 'msi',      pack: 'MSI Pack',         years: '2015 – 2025 (no 2020)',   teams: 'EDG · SKT ×2 · RNG ×3 · G2 · JDG · Gen.G ×2' },
        { type: 'First Stand',     quality: 'FirstStand', qc: 'firststand', pack: 'First Stand Pack', years: '2025, 2026',          teams: 'HLE (2025) · BLG (2026)' },
        { type: 'Player of Year',  quality: 'POTY',     qc: 'poty',     pack: 'Awards Vault',     years: '2024, 2025',              teams: 'Faker / T1 (2024) · Chovy / Gen.G (2025)' },
        { type: 'Team of Year',    quality: 'TOTY',     qc: 'toty',     pack: 'Awards Vault',     years: '2024, 2025',              teams: 'T1 full roster (both years)' },
        { type: 'Rookie of Year',  quality: 'ROTY',     qc: 'roty',     pack: 'Awards Vault',     years: '2024, 2025',              teams: 'Massu / FQ (2024) · HongQ / CFO (2025)' },
    ];

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
            { q: 'Pack Types', a: 'Standard (100 BE) — up to Gold. Premium (600 BE) — up to Diamond. Elite (1,000 BE) — up to Master. First Stand (3,000 BE) — up to FirstStand. MSI (5,000 BE) — up to MSI. Champion (6,000 BE) — up to Champion. MVP (8,000 BE) — up to MVP. Awards Vault (12,000 BE) — POTY/TOTY/ROTY cards. Rarest pack in the game (0.25% POTY chance).' },
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
            { q: 'Salary Cap Mode (Always available)', a: 'Build a squad from your own club within a 50,000 CAP budget. Card value = (Rating - 60) × 500. Forces strategic choices — you can\'t just use your best players. 5 elite rounds. Win: 8,000 BE.' },
            { q: 'Rival Challenge (Requires cloud save)', a: 'Browse the leaderboard and challenge another manager\'s saved squad. Fight their actual squad in a 3-match series. Win: 3,000 BE. Requires Firebase sign-in.' },
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
            { q: 'Skill Tree', a: 'Scouting (pack odds), Tactics (combat boost +1/level), Transfer (sell value), Conditioning (chemistry), Stamina (split cooldown -10s/level), Mentorship (XP gain +10%/level), Trade Mastery (trade slots/discounts), Bench Management (mid-split swaps), Club Capacity (+50 cards/level), Wealth Management (+10% BE from rewards/level).' },
            { q: 'Prestige System', a: 'Reach Manager Level 100 and choose to Prestige. This resets your XP, Level, and all Skills to 0 — but you keep all cards, BE, trophies, and trackStats. Each Prestige earns a ⭐ badge in the header. Milestone card unlocked at Prestige 1.' },
            { q: 'Career Milestone Cards', a: 'Special cosmetic cards auto-generated when you hit career milestones: First Worlds win, First MSI win, Golden Road, Tower Floor 100, 100 Packs Opened, 10 Splits, Prestige 1. Shown on your Home page.' },
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
        { id: 'msi-history', title: '🏆 MSI History & Event Cards', content: [
            { q: 'What is MSI?', a: 'The Mid-Season Invitational (MSI) is Riot\'s annual international tournament held between spring and summer splits. Champions from each major region compete. MSI cards are ultra-rare event cards obtainable only from the MSI pack (5,000 BE / 3,500 BE during event).' },
            { q: '2025 MSI — Gen.G (Champion)', a: 'Region: LCK · Roster: Kiin, Canyon, Chovy, Ruler, Duro · Result: Gen.G win their first MSI title, capping a dominant 2025 spring season. Cards: 9201–9205 (MSI quality).' },
            { q: '2024 MSI — Gen.G (Champion)', a: 'Region: LCK · Roster: Kiin, Canyon, Chovy, Peyz, Lehends, KIM (coach) · Result: Gen.G defeat Bilibili 3-0 in the final. Cards: 9206–9211 (MSI quality).' },
            { q: '2023 MSI — JDG (Champion)', a: 'Region: LPL · Roster: 369, Kanavi, knight, Ruler, Missing, Homme (coach) · Result: JDG sweep BLG 3-0, first JDG international title. Cards: 9212–9217 (MSI quality).' },
            { q: '2022 MSI — RNG (Champion)', a: 'Region: LPL · Roster: Bin, Wei, Xiaohu, GALA, Ming, KenZhu (coach) · Result: RNG beat T1 3-2 in a classic final. GALA named Finals MVP. Cards: 9218–9223 (MSI quality).' },
            { q: '2021 MSI — RNG (Champion)', a: 'Region: LPL · Roster: Xiaohu, Wei, Cryin, GALA, Ming · Result: RNG defeat DamwonKia 3-2. First MSI hosted at bubble event. Cards: 9240–9244 (MSI quality).' },
            { q: '2020 MSI — Cancelled', a: 'MSI 2020 was cancelled due to the COVID-19 pandemic. No event cards exist for this year.' },
            { q: '2019 MSI — G2 Esports (Champion)', a: 'Region: LEC · Roster: Wunder, Jankos, Caps, Perkz, Mikyx, GrabbZ (coach) · Result: G2 sweep Team Liquid 3-0. First European team to win MSI. Cards: 9230–9235 (MSI quality).' },
            { q: '2018 MSI — RNG (Champion)', a: 'Region: LPL · Result: 14W-4L, 78% WR · Roster: Letme, Karsa, Xiaohu, Uzi, Ming · Uzi named Finals MVP with 8.6 KDA and 39.4% damage share. Beat KZ 3-1 in the final. Cards: 9250–9255 (MSI quality).' },
            { q: '2017 MSI — SKT T1 (Champion)', a: 'Region: LCK · Result: 14W-3L, 82% WR · Roster: Huni, Peanut, Faker, Bang, Wolf, kkOma (coach) · Peanut led with 7.4 KDA. Wolf had best kill participation (64.5%). Huni played aggressive carry top (25.3% damage share). Beat G2 3-1 in the final. Cards: 9291–9296 (MSI quality).' },
            { q: '2016 MSI — SKT T1 (Champion)', a: 'Region: LCK · Result: 12W-5L, 71% WR · Roster: Duke, Blank, Faker, Bang, Wolf, kkOma (coach) · Bang led with 6.7 KDA and 31.4% damage share. Blank had highest kill participation (70.9%). Duke posted 7.0 KDA as a clean tank top laner. Beat CLG 3-0 in the final. Cards: 9297–9302 (MSI quality).' },
            { q: '2015 MSI — EDG Edward Gaming (Inaugural Champion)', a: 'Region: LPL · Result: 10W-3L, 77% WR · Roster: Koro1, ClearLove, PawN, Deft, Meiko, Aaron (coach) · FIRST EVER MSI. ClearLove was the Finals MVP with the best KDA in the entire tournament: 10.0 (51K/21D/158A). Koro1 had 6.4 KDA (2nd in tournament), Meiko had 197 assists. Beat SKT T1 3-2 in the final. Cards: 9303–9308 (MSI quality).' },
            { q: 'MSI Pack Drop Rates', a: 'Base: 0.5% MSI · 1% Challenger · 5% Grandmaster · 10% Master · 20% Diamond · 35% Platinum · 28.5% Gold. During the MSI 2026 event (until July 12): same boosted rates, pack costs only 3,500 BE (was 5,000). Pity system guarantees an MSI card within 70 pulls.' },
            { q: 'MSI 2026 Event Code', a: 'Redeem code MSI2026 in the Account panel (top-right) for a free Signature MSI card. One-time use per account. Works until July 12, 2026.' },
        ]},
        { id: 'card-coverage', title: '📊 Card Coverage by Region & Year', content: [] },
        { id: 'changelog', title: '📋 Update Log', content: [
            { q: 'Beta 1.1.6 — Public Build', a: '• MSI 2015 EDG cards added — 6 new cards from the INAUGURAL MSI champion (ClearLove, PawN, Deft, Meiko, Koro1, Aaron). Stats based on real tournament data: ClearLove had 10.0 KDA (best in tournament), Finals MVP\n• 2015 is now the earliest year with MSI coverage — 2015 was the first ever MSI (no earlier tournaments exist)\n• Guide: Card Coverage table updated to show MSI 2015–2025 (no 2020), MSI History section updated with 2015 entry\n• Leaderboard power now correctly includes Conditioning skill bonus (fixes Squad vs Leaderboard mismatch)\n• Card Coverage by Region & Year table added to Guide — shows which years each region is in the game, and all special card types with packs, years, and teams' },
            { q: 'Beta 1.1.5', a: '• Battle Pass: Claim All button — collect every unlocked reward in one click\n• 12 new MSI champion cards based on real tournament data: SKT T1 2017 MSI (Huni/Peanut/Faker/Bang/Wolf/kkOma) and SKT T1 2016 MSI (Duke/Blank/Faker/Bang/Wolf/kkOma) — stats derived from actual KDA, damage share, and kill participation\n• MSI 2026 Event extended to July 12 — boosted drop rates, 3,500 BE pack price\n• New promo code: MSI2026 — free Signature MSI card (account panel)\n• Guide: MSI History section with year-by-year champion rosters, real stats, and card IDs\n• Salary Cap flex picks: any card can fill any role at 25% salary discount + −10% stat debuff\n• Wealth Management: +X% BE badge in header, bonus shown in all reward toasts\n• Anti-cheat: save integrity hash, card stat validation on load, Firebase leaderboard security rules\n• Unique team names auto-generated for new players (no more duplicate "My Team" on leaderboard)\n• Infinity Tower: starts at Gold tier, scales infinitely past floor 20 with no cap\n• Leaderboard now shows Blue Essence as a sortable column' },
            { q: 'Beta 1.1.2', a: '• League Awards 2024 & 2025 cards: POTY (Faker, Chovy), TOTY (T1 full lineup both years), ROTY (Massu, HongQ) — 14 new ultra-rare cards\n• Awards Vault pack: 12,000 BE · 0.25% POTY · 1% TOTY · 3% ROTY — rarest pack in the game\n• Salary Cap Mode: Build a 50,000 CAP squad from your club. Cards priced by rating. Beat elite opponents for 8,000 BE\n• Rival Challenge: Fight another leaderboard player\'s saved squad. 3-match series, 3,000 BE reward\n• Prestige System: Reach Manager Lv 100 to Prestige. Resets XP/Skills, keeps all cards/BE/trophies. ⭐ badge in header\n• Career Milestone Cards: Earn special cards for achievements (First Worlds, Golden Road, Tower 100, etc.) Shown on Home page\n• Coming Soon updated: Franchise Mode, Friend List, Player Form System' },
            { q: 'Beta 1.1.1.2', a: '• 55 milestone quests (was 39), 10 repeatable contracts (was 7), 25 achievements (was 17)\n• New Draft Mode quests: Win/Play Draft milestones + repeatable contract\n• New economy quests: Perform 10/50 Upgrades\n• Higher-tier competitive goals: Win 10 First Stands, Win 5 MSIs, Win 5 Worlds, Win 100 Cafes\n• New achievements: 98+ Squad Avg, Manager Lv 100, Tower Floor 200, Own 1000 Cards, Win 10/50 Drafts\n• Draft Mode: cards now sort by natural role when picking for a position\n• Draft Mode: card clicks work properly for banning and picking (no more inspect popup)\n• Draft Mode: squad cards displayed on sides during match phase\n• MSI event pity counter now updates live after each pack open\n• ON (BLG) 2026 FirstStand card buffed to 97 to match base card' },
            { q: 'Beta 1.1.0', a: '• DRAFT MODE — New gamemode! 15 random cards, 5 bans each side, build a squad, best of 5. Off-role flex penalty (-10 stats), legacy cards are wildcards\n• MSI 2026 LIMITED EVENT — 24hr global event with boosted MSI pack drop rates + guaranteed MSI card pity at 70 pulls\n• Wealth Management skill: +10% bonus BE from all rewards per level (max 5)\n• Conditioning skill now works: +1 total power per level across all modes\n• Dynamic milestones on Home page, Legacy card tracker, Career stats expanded\n• Card Showcase moved to Club with drag-and-drop reordering\n• Archive completion uses full team size, Coming Soon gamemodes in Play tab' },
            { q: 'Beta 1.0.9.2', a: '• Card Showcase with drag-and-drop in Club Vault\n• Squad locks during active season splits — bench swaps only\n• Bench Management skill (max 3) for mid-split player swaps\n• Combat UI overhaul: Power bar, Stat vs Net split, full log breakdown\n• Upgrade Lab notification badges per tier and role\n• Battle Pass auto-levels, Leaderboard autosync, Redeem codes\n• Player ratings updated for 2025-2026 based on real performance data' },
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
                        {#if section.id === 'card-coverage'}
                            <div class="cov-wrap">
                                <h4 class="cov-head">Regular Cards by Region & Year</h4>
                                <p class="cov-sub">Years 2017–2023 have no regular region cards — Legacy event cards (Champion, MSI) cover those gaps.</p>
                                <div class="cov-scroll">
                                    <table class="cov-table">
                                        <thead>
                                            <tr>
                                                <th class="cov-th cov-th-left">Region</th>
                                                {#each COV_YEARS as yr}<th class="cov-th">{yr}</th>{/each}
                                                <th class="cov-th cov-th-left">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each regionData as row}
                                                <tr>
                                                    <td class="cov-region">{row.r}</td>
                                                    {#each COV_YEARS as yr}
                                                        <td class="cov-cell {row.years.includes(yr) ? 'cov-yes' : 'cov-no'}">
                                                            {row.years.includes(yr) ? '✓' : '—'}
                                                        </td>
                                                    {/each}
                                                    <td class="cov-note-cell">{row.note}</td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>

                                <h4 class="cov-head" style="margin-top:24px">Special & Tournament Cards</h4>
                                <p class="cov-sub">All special cards are in the "Legacy" region — they bypass era and region chemistry as wildcards.</p>
                                <div class="cov-scroll">
                                    <table class="cov-table">
                                        <thead>
                                            <tr>
                                                <th class="cov-th cov-th-left">Card Type</th>
                                                <th class="cov-th">Quality</th>
                                                <th class="cov-th cov-th-left">Pack</th>
                                                <th class="cov-th cov-th-left">Years in Game</th>
                                                <th class="cov-th cov-th-left">Teams / Players</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each specialData as row}
                                                <tr>
                                                    <td class="cov-type">{row.type}</td>
                                                    <td class="cov-badge-cell"><span class="cov-badge cov-q-{row.qc}">{row.quality}</span></td>
                                                    <td class="cov-note-cell">{row.pack}</td>
                                                    <td class="cov-years-cell">{row.years}</td>
                                                    <td class="cov-teams-cell">{row.teams}</td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        {:else}
                            {#each section.content as item}
                                <div class="gs-item">
                                    <h4 class="gs-q">{item.q}</h4>
                                    <p class="gs-a">{item.a}</p>
                                </div>
                            {/each}
                        {/if}
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

    /* Card Coverage Tables */
    .cov-wrap { padding-top: 4px; }
    .cov-head { font-size: 13px; font-weight: 900; color: #93c5fd; margin-bottom: 6px; }
    .cov-sub { font-size: 11px; color: #475569; margin-bottom: 12px; line-height: 1.5; }
    .cov-scroll { overflow-x: auto; margin-bottom: 4px; }
    .cov-table {
        width: 100%; border-collapse: collapse; font-size: 11px; min-width: 420px;
    }
    .cov-th {
        padding: 8px 12px; text-align: center; font-size: 10px; font-weight: 900;
        color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;
        border-bottom: 1px solid rgba(51,65,85,0.3); white-space: nowrap;
    }
    .cov-th-left { text-align: left; }
    .cov-table tbody tr { border-bottom: 1px solid rgba(51,65,85,0.1); transition: background 0.1s; }
    .cov-table tbody tr:hover { background: rgba(30,41,59,0.3); }
    .cov-table tbody tr:last-child { border-bottom: none; }

    .cov-region { padding: 9px 12px; font-weight: 900; font-size: 12px; color: #e2e8f0; white-space: nowrap; }
    .cov-cell { padding: 9px 8px; text-align: center; font-weight: 900; font-size: 13px; }
    .cov-yes { color: #34d399; }
    .cov-no  { color: #334155; }
    .cov-note-cell { padding: 9px 12px; font-size: 10px; color: #475569; white-space: nowrap; }

    .cov-type       { padding: 9px 12px; font-weight: 700; font-size: 11px; color: #cbd5e1; white-space: nowrap; }
    .cov-badge-cell { padding: 9px 8px; text-align: center; }
    .cov-years-cell { padding: 9px 12px; font-size: 10px; color: #94a3b8; white-space: nowrap; }
    .cov-teams-cell { padding: 9px 12px; font-size: 10px; color: #64748b; }

    .cov-badge {
        display: inline-block; padding: 2px 8px; border-radius: 999px;
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
        white-space: nowrap;
    }
    .cov-q-champion  { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .cov-q-mvp       { background: rgba(249,115,22,0.15); color: #fb923c; border: 1px solid rgba(249,115,22,0.3); }
    .cov-q-finalist  { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
    .cov-q-msi       { background: rgba(6,182,212,0.15);  color: #22d3ee; border: 1px solid rgba(6,182,212,0.3); }
    .cov-q-firststand{ background: rgba(20,184,166,0.15); color: #2dd4bf; border: 1px solid rgba(20,184,166,0.3); }
    .cov-q-poty      { background: rgba(234,179,8,0.15);  color: #facc15; border: 1px solid rgba(234,179,8,0.35); }
    .cov-q-toty      { background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3); }
    .cov-q-roty      { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
</style>
