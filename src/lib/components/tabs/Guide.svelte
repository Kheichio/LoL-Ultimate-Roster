<script>
    import Icon from '../ui/Icon.svelte';
    import { UPDATES } from '../../utils/updates.js';
    import { openUpdates } from '../../stores/menu.js';

    const COV_YEARS = ['2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'];
    const MAJOR_YEARS = ['2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'];
    const regionData = [
        { r: 'LCK', years: MAJOR_YEARS, note: 'Full + Summer 18–23' },
        { r: 'LPL', years: MAJOR_YEARS, note: 'Full + Summer 18–23' },
        { r: 'LEC', years: MAJOR_YEARS, note: 'Full + Summer 18–23' },
        { r: 'LCS', years: ['2015','2016','2024','2025','2026'],                                   note: 'No 2011–2014, No 2017, No 2021–2023' },
        { r: 'LCP', years: ['2015','2016','2024','2025','2026'],                                   note: 'No 2011–2014, No 2017, No 2021–2023' },
        { r: 'CBLOL', years: ['2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'], note: 'Split 2 every year · 2025 ran as LTA South' },
    ];
    const specialData = [
        { type: 'Hall of Legends',  quality: 'Hall of Legends', qc: 'halloflegends', pack: 'Awards Vault', years: '2024, 2025, 2026',            teams: 'Faker / T1 (2024) · Uzi / RNG (2025) · Caps / G2 (2026)' },
        { type: 'Worlds Champion', quality: 'Champion', qc: 'champion', pack: 'Champion Pack',    years: '2011 – 2025 (every year)', teams: 'FNC · TPA · SKT ×5 · SSW · SSG · IG · FPX · DK · EDG · DRX · T1 ×3' },
        { type: 'Finals MVP',      quality: 'MVP',      qc: 'mvp',      pack: 'MVP Pack',         years: '2011 – 2025 (every year)', teams: 'One card per year — same winning team' },
        { type: 'Worlds Finalist', quality: 'Finalist', qc: 'finalist', pack: 'First Stand+',    years: '2015, 2016, 2023, 2024, 2025', teams: 'KOO · SSG · WBG · BLG · KT' },
        { type: 'MSI Champion',    quality: 'MSI',      qc: 'msi',      pack: 'MSI Pack',         years: '2015 – 2026 (no 2020)',   teams: 'EDG · SKT ×2 · RNG ×3 · G2 · JDG · Gen.G ×2 · HLE' },
        { type: 'First Stand',     quality: 'FirstStand', qc: 'firststand', pack: 'First Stand Pack', years: '2025, 2026',          teams: 'HLE (2025) · BLG (2026)' },
        { type: 'EWC Champion',    quality: 'EWC',      qc: 'ewc',      pack: 'EWC Pack',         years: '2024, 2025, 2026',        teams: 'T1 (2024) · Gen.G (2025) · DK (2026)' },
        { type: 'Player of Year',  quality: 'POTY',     qc: 'poty',     pack: 'Awards Vault',     years: '2024, 2025',              teams: 'Faker / T1 (2024) · Chovy / Gen.G (2025)' },
        { type: 'Team of Year',    quality: 'TOTY',     qc: 'toty',     pack: 'Awards Vault',     years: '2024, 2025',              teams: 'T1 full roster (both years)' },
        { type: 'Rookie of Year',  quality: 'ROTY',     qc: 'roty',     pack: 'Awards Vault',     years: '2024, 2025',              teams: 'Massu / FQ (2024) · HongQ / CFO (2025)' },
    ];

    const sections = [
        { id: 'getting-started', icon: 'welcome', title: 'Getting Started', content: [
            { q: 'How do I start?', a: 'Claim your free Starter Pack from the Store (6 cards, one per role). Assign them to your Squad, then enter the Gaming Cafe Tournament from the Play menu.' },
            { q: 'What is Blue Essence (BE)?', a: 'BE is the in-game currency. Earn it from tournaments, season splits, daily login, quests, and selling cards. Spend it on packs, trade refreshes, and more.' },
            { q: 'How do I save my progress?', a: 'Local progress saves automatically to your browser. Sign in with an account to save to the cloud and sync across devices. Auto-save runs every 10 minutes when signed in.' },
        ]},
        { id: 'cards', icon: 'cards', title: 'Cards & Tiers', content: [
            { q: 'Card Tiers (lowest to highest)', a: 'Bronze → Silver → Gold → Platinum → Diamond → Master → Grandmaster → Challenger. Special tiers: Champion, MVP, Finalist, MSI, FirstStand, EWC, POTY, ROTY, TOTY, GPOTY, X. Above all of them sits Hall of Legends — the mythic tier.' },
            { q: 'Hall of Legends (mythic)', a: 'The rarest and most prestigious tier in the game — and the smallest: it mirrors Riot\'s real Hall of Legends, so it holds one card per inductee: Faker (T1, 2024 inaugural inductee), Uzi (RNG, 2025) and Caps (G2, 2026 — the first Western player inducted). Every Hall of Legends card is statistically perfect — 100 rating with 100 in all six stats. They only ever drop from the Awards Vault pack at 0.001% per card, sell for 1,000 BE (the highest in the game). They are NOT chemistry wildcards — unlike Champion/MSI/EWC cards they count as their own region, era and team, so a squad built around several of them loses chemistry.' },
            { q: 'Card Stats', a: 'Each card has 6 stats: MEC (Mechanics), TMF (Teamfight), FRM (Form), CMP (Composure), MAP (Macro), LDR (Leadership). These determine combat performance.' },
            { q: 'Ratings & Stats (1.4.0)', a: 'A card\'s overall rating lines up with its six stats — the two scale together, so a strong stat line means a high rating. Elite 98–100 stats only appear on elite-rated (97+) cards, and coaches are rated on everything except Mechanics.' },
            { q: 'Card Looks (1.4.0)', a: 'Several tiers were redesigned: EWC is a brushed gold-and-emerald "Trophy Forge" frame, Champion an imperial purple-and-gold "coronation", and Team of the Year an all-star platinum chrome. Diamond cards switched to dark text so they no longer look like coach cards, and the Grandmaster red is softer on the eyes.' },
            { q: 'Signature Cards (+2 all stats, +2 rating)', a: 'Extremely rare (0.1% per card). Adds +2 to all 6 stats and +2 to the card rating. Has a golden glow effect. Can stack with Holographic.' },
            { q: 'Holographic Cards (+1 all stats, +1 rating)', a: 'Rare (1% per card). Adds +1 to all 6 stats and +1 to the card rating. Has a rainbow outline effect. Can stack with Signature for +3 total.' },
            { q: 'Locking & Favouriting', a: 'Lock cards to prevent accidental selling or trading. Favourite cards to sort them to the top of your club. Both can be done from the buttons under every card in the Club Vault, or from the Card Detail view.' },
            { q: 'Card Showcase', a: 'Your top three cards, shown on your leaderboard profile. In the Club Vault, press Add a card on an empty showcase slot and click the card you want, or press the pin button under any card. Drag the showcase cards to reorder them. Quick Sell and Sell Duplicates never sell a showcased card.' },
        ]},
        { id: 'store', icon: 'store', title: 'Store & Packs', content: [
            { q: 'Pack Types', a: 'Standard (100 BE) — up to Gold. Premium (600 BE) — up to Diamond. Elite (1,000 BE) — up to Master. First Stand (3,000 BE) — up to FirstStand. EWC (4,000 BE) — up to EWC (Esports World Cup winners). MSI (5,000 BE) — up to MSI. Champion (6,000 BE) — up to Champion. MVP (8,000 BE) — up to MVP. Awards Vault (12,000 BE) — POTY/TOTY/ROTY cards, and the only place Hall of Legends cards can drop. Rarest pack in the game (0.001% Hall of Legends, 0.1% POTY).' },
            { q: 'Drop Rates', a: 'Each pack has different drop percentages. Click "Preview" on any pack to see exact rates. Top-tier cards in special packs have 0.5% drop chance. Signature is always 0.1%, Holographic is always 1%. The single rarest drop is Hall of Legends — 0.001% per card slot, Awards Vault only, and every one is a perfect 100 rating with 100 in all six stats.' },
            { q: 'Scouting Skill', a: 'Each level of Scouting Network gives +5% better odds on every tier above a pack\'s lowest (+25% at level 5), taken from the lowest tier. The drop rates shown in the Store and the pack preview already include your bonus.' },
            { q: 'Bulk Opening Skill', a: 'Buy and open several packs in one go. Each of the 4 levels adds +1 pack to a bulk open, so at max you can open 5 packs at once from the Store.' },
        ]},
        { id: 'rbc', icon: 'puzzle', title: 'Roster Building Challenges', content: [
            { q: 'What are RBCs?', a: 'Roster Building Challenges live in the RBCs tab (between Academy and Season) and unlock after your first World Championship win. Each is a daily puzzle: submit a themed set of 5 players from your Club and the cards are consumed in exchange for 5 free packs, which then appear in a "Free Packs" section at the top of the Store for you to open for free — no Blue Essence required.' },
            { q: 'How do rewards scale?', a: 'The more a challenge asks you to invest, the better the packs you earn. Requirements and rewards climb together from 5 free Premium packs all the way up to 5 free EWC packs.' },
            { q: 'Daily challenge list', a: '• Warm-Up (Difficulty 1) — any 5 players, avg rating 78+ → Premium pack ×5\n• Regional Pride (2) — 5 players from the same region, avg 84+ → Elite pack ×5\n• Era Dynasty (3) — 5 players from the same era, avg 87+ → First Stand pack ×5\n• Hometown Heroes (4) — 5 players from one team, avg 88+ → MSI pack ×5\n• Legendary Five (5) — 5 players avg 90+ including 2+ Legacy/Award/Hall of Legends cards → EWC pack ×5' },
            { q: 'What can I submit?', a: 'Any Club players except those in your active Squad or Academy. Locked, holographic and signature cards are protected and cannot be used, so you never lose your best cards by accident. Submitted players are permanently consumed — feed in spares and duplicates.' },
            { q: 'When do they reset?', a: 'Each challenge can be completed once per day. All challenges reset at local midnight; a live countdown at the top of the tab shows how long until the next reset.' },
        ]},
        { id: 'squad', icon: 'squad', title: 'Squad Building', content: [
            { q: 'Squad Positions', a: 'Fill TOP, JNG, MID, ADC, SUP (5 starters) + optional COACH. All 5 starters are needed to compete in any tournament or season match.' },
            { q: 'Total Power', a: 'Total Power = Average Rating + Region Chemistry + Era Chemistry + Team Synergy + Coach Bonus + Legacy Bonus + Conditioning skill. This is your combat strength. The Analytics panel in Squad Builder breaks it down bonus by bonus and tells you what each one needs.' },
            { q: 'Chemistry Bonuses', a: 'Region: Same region gives up to +5. Era: Same era gives up to +5 (Eras: 2011-13, 2014-16, 2017-19, 2020-22, 2023-25, 2026+). Team synergy: +1 for every pair of starters from the same team, up to +2 — two duos from different teams count as much as a full stack. Coach: Higher-rated coach gives +1 to +5. Legacy tier cards bypass era/region as wildcards.' },
            { q: 'Auto Fill', a: 'The Auto Fill button picks the best cards by total stat sum for each role from your club.' },
            { q: 'Stat Comparison', a: 'When picking cards in the squad builder, you see a stat comparison panel showing the difference vs your current card for each stat.' },
            { q: 'Bench Selection (1.4.0)', a: 'Opening a bench slot shows every eligible card, with filters by role and sorting by rating or any single stat (MEC/TMF/FRM/CMP/MAP/LDR) — so you can quickly line up the exact specialist you want ready to swap in mid-split.' },
        ]},
        { id: 'combat', icon: 'swords', title: 'Combat System', content: [
            { q: 'How combat works', a: 'A match is a series of games. Each game, 3 random plays are drawn from 5 stats (Mechanical, Teamfight, Macro, Form, Composure) and you pick one. The CPU secretly picks a play of its own at random, and your team average in your play\'s stat is compared with its team average in its play\'s stat. That difference is added to your Total Power against their rating, plus luck (±5 each side).' },
            { q: 'Formula', a: 'Your Score = Total Power + (Your Stat in your play − CPU Stat in its play) + Random(±5). CPU Score = CPU Rating + Random(±5). Higher score wins the game; a tie goes to you.' },
            { q: 'Best of 3 / Best of 5', a: 'Tournament and Infinity Tower matches are best-of-3 (first to 2 wins). Season and Draft matches are best-of-5 (first to 3 wins). Rival Challenge matches are best-of-5 too, and the series goes to whoever takes 3 matches first.' },
            { q: 'The match screen', a: 'Both lineups sit either side of the play area as cards — or, with the Cards / Compact switch above your lineup, as slim player rows. Click any player to see their full card. Every play shows your exact chance of winning the game with it, worked out from that formula, and the bar under the scoreboard shows your chance of winning the whole series from here. When a game resolves, both plays are revealed with the full sum behind each score; click the reveal to skip it. Keys 1, 2 and 3 pick a play.' },
            { q: 'Legacy Mode', a: 'Prefer the original look? Legacy Mode, under Challenge Modes on the Play menu, has the original arena list and the original match screen. The rules are the same as everywhere else: the Gaming Cafe is open any time, and First Stand, MSI and Worlds open when the Season qualifies you.' },
        ]},
        { id: 'tournaments', icon: 'trophy', title: 'Tournaments', content: [
            { q: 'Gaming Cafe (Always available)', a: '3 rounds, CPU capped at Gold tier. Free entry, play it as often as you like. Win: 300 BE, 2nd: 150 BE.' },
            { q: 'Regional Trophy (end of every split)', a: 'The playoffs of every Season split: the top 4 of the league play semi-finals (1 v 4, 2 v 3) and a final, all best of 5. Champion: +1,500 BE, runner-up: +500 BE. It is where you qualify for the international events.' },
            { q: 'First Stand (Winter champion)', a: 'Only the champion of the Winter split\'s Regional Trophy goes. 5 rounds, tough opponents. Win: 3,000 BE, 2nd: 1,000 BE.' },
            { q: 'MSI (Spring finalists)', a: 'Both finalists of the Spring split\'s Regional Trophy go. 7 rounds, elite competition. Win: 5,000 BE, 2nd: 2,000 BE.' },
            { q: 'World Championship (Summer finalists)', a: 'Both finalists of the Summer split\'s Regional Trophy go. 7 rounds, the ultimate challenge. Win: 10,000 BE, 2nd: 4,000 BE.' },
            { q: 'Playing an international event', a: 'Once you qualify, the event appears as "Play — qualified" on the Play menu (and a button on the Season page). You get one run at it. If you start the next split without playing it, you give the spot up.' },
            { q: 'Golden Road', a: 'Not an event any more — a season goal. Win all six titles of one year, in order: Winter Regional → First Stand → Spring Regional → MSI → Summer Regional → Worlds. Miss any one and the road is gone until next year\'s Winter split. Reward: 25,000 BE. The Season page and the Play menu show this year\'s checklist.' },
            { q: 'Salary Cap Mode (Always available)', a: 'Build a squad from 15 random club cards within an 85,000 CAP budget. Prices are banded by rating, from 4,000 (below 85) up to 32,000 (99+); a flex pick (wrong role) costs 25% less but takes −10% stats in the match. Forces strategic choices — you can\'t just use your best players. There is no coach slot in this mode — five players only. 5 elite rounds. Win: 8,000 BE.' },
            { q: 'Rival Challenge (Requires cloud save)', a: 'Browse the leaderboard and challenge another manager\'s saved squad. Fight their actual squad in a 3-match series. Win: 3,000 BE. Requires Firebase sign-in.' },
        ]},
        { id: 'season', icon: 'calendar', title: 'Season Splits', content: [
            { q: 'The year', a: 'Three splits a year, like the real LoL calendar: Winter (→ First Stand), Spring (→ MSI) and Summer (→ Worlds).' },
            { q: 'How a split works', a: 'A 10-team league: you and nine CPU sides, everyone plays everyone once (9 matchdays, best of 5). You meet the weakest side first and the strongest last, and every other side\'s game is simulated each matchday, so the standings table is real. Ties on wins are split by games won and lost, then head-to-head. The top 4 play the Regional Trophy.' },
            { q: 'Split Rewards', a: 'League finish: 1st 3,000 BE, 2nd 2,200, 3rd 1,700, 4th 1,300, down to 10th 200. Regional Trophy: champion +1,500, runner-up +500. Unbeaten 9-0 league: +1,000. Claim them from the results screen when the split ends.' },
            { q: 'Death Splits', a: 'Later splits add HARD sides (rating 88-100) and, from the third year of difficulty, BOSS sides (rating 110-120) near the end of the fixture list. BOSS sides are near-impossible to beat — and they take points off everyone else in the league too.' },
            { q: 'Team Meta & Slumps', a: 'Each split has 2 meta phases (matchdays 1-5, then 6-9 and the playoffs). 5 teams are buffed (+8 to +20 all stats) and 12 teams are nerfed/slumping (-10 to -30). Only your affected squad members are shown. Plan your roster around the meta!' },
            { q: 'Squad Lock & Bench Swaps', a: 'Your squad is locked from the first league match to the end of the Regional Trophy. Upgrade the Bench Management skill (up to 3 bench slots) to swap bench players in mid-split. Use swaps to react to meta shifts and slumps.' },
        ]},
        { id: 'progression', icon: 'skills', title: 'Progression', content: [
            { q: 'Manager Level & XP', a: 'Earn XP from opening packs (+50 each), tournament runs (+100 Cafe up to +800 Worlds, 40% if you go out), the Golden Road (+2,000), Season matches (+150 a win, +60 a loss), Draft (+300 a win, +100 a loss), Infinity Tower floors, Academy runs and Archive discoveries. Each level grants 1 Skill Point. XP needed per level = Level × 500. The Skills & Progression tab lists every source.' },
            { q: 'Skill Tree', a: 'Scouting (+5% odds per level on every pack tier above the lowest), Tactics (combat boost +1/level), Transfer (sell value), Conditioning (+1 squad Power/level), Stamina (split cooldown -10s/level), Mentorship (XP gain +10%/level), Trade Mastery (more Transfer Market listings, fewer cards and −5% BE per level on every signing), Bench Management (mid-split swaps), Club Capacity (+50 cards/level), Wealth Management (+10% BE from rewards/level), Bulk Opening (+1 pack per bulk open, max 4 — buy and open up to 5 Store packs at once).' },
            { q: 'Prestige System', a: 'Reach Manager Level 100 and choose to Prestige. This resets your XP, Level, and all Skills to 0 — but you keep all cards, BE, trophies, and trackStats. Each Prestige earns a ⭐ badge in the header. Milestone card unlocked at Prestige 1.' },
            { q: 'Career Milestone Cards', a: 'Special cosmetic cards auto-generated when you hit career milestones: First Worlds win, First MSI win, Golden Road, Tower Floor 100, 100 Packs Opened, 10 Splits, Prestige 1. Shown on your Home page.' },
            { q: 'Manager Titles', a: 'Scout (0 TP) → Manager (10) → Director (30) → GM (75) → Executive (150) → President (250) → Hall of Fame (400) → Legend (600) → Immortal (1,000). Earn Trophy Points from tournament wins.' },
            { q: 'Trophy Points', a: 'Worlds win: ×6. MSI win: ×4. First Stand win: ×2. Regional win: ×1. Golden Road: ×10.' },
        ]},
        { id: 'rewards', icon: 'gift', title: 'Rewards', content: [
            { q: 'Daily Login', a: '28-day cycle of rewards including BE, cards (Silver to Diamond), Skill Points, and Battle Pass XP. Claim once per day. Cycles repeat after 28 days.' },
            { q: 'Battle Pass', a: '100 tiers of rewards. Earn XP from matches, pack opens, daily login, and quests. Rewards include BE, Skill Points, team icons, team colors, and cards up to Grandmaster. Tiers 96-100 are repeatable.' },
            { q: 'Quests', a: 'Milestones: One-time goals across Collection, Economy, Competitive, and Progression categories. Contracts: Repeatable quests with infinite completions. Achievements: Live state checks (squad avg, club size, trophies).' },
        ]},
        { id: 'other', icon: 'sparkle', title: 'Other Features', content: [
            { q: 'Academy Team', a: 'Unlocked after you win Worlds. Build a second five (separate from your main squad) and send them to auto-farm once per hour. Rewards — Blue Essence and manager XP — scale with the academy team\'s rating. The roster locks while a run is training; collect when the hour is up. Assigned players can\'t be sold. Found on the Academy tab, next to Squad.' },
            { q: 'Bulk Selling', a: 'In the Club Vault, open Clean Up to sell every card of a chosen tier at once, or every duplicate while keeping your best copy of each player. Locked, favourited, showcased, squad and academy cards are always protected.' },
            { q: 'Transfer Market — Signings', a: 'A rotating board of real, fully-visible players, from Gold up to Challenger and even Legacy/Award cards. Sign one with your lowest-rated spare cards plus Blue Essence: Gold 2 cards + 250 BE, Platinum 3 + 600, Diamond 3 + 1,500, Master 4 + 3,800, Grandmaster 5 + 9,500, Challenger 6 + 21,000, Legacy/Award 8 + 42,000. One listing per rotation is a Hot Deal (35% off and one card fewer). Re-roll the whole board for 300 BE, then 600 BE — twice per rotation. Each listing can be signed once per rotation.' },
            { q: 'Transfer Market — Club requests', a: 'Clubs ask for a spare card of a given tier and role and pay 3–6× its Quick Sell value (more for lower tiers). Your lowest-rated matching card is offered, and you confirm before anything is sold. Three requests per rotation, four at Trade Mastery 3 and five at 5. Both boards refresh every 15 minutes. Squad, Academy, locked, holographic, signature and Legacy/Award cards are never used.' },
            { q: 'Upgrade Lab', a: 'Combine multiple cards of the same role and tier to forge one higher-tier card. E.g. 10× Bronze → 1× Silver. Tops out at Grandmaster — Challenger cards can\'t be crafted (they only drop from packs). Costs BE per upgrade.' },
            { q: 'Archive', a: 'Track your collection completion across all teams, regions, and special card categories. Cards you\'ve owned are permanently marked. Every newly discovered card pays 25 BE (Claim all collects every one at once), and a finished team pays a bonus of 200 to 2,000 BE depending on its size. Use the Owned / Missing filter to see exactly which cards you still need. "All cards" searches across every card type at once (name, team, year, tier or region) and shows your completion for each type.' },
            { q: 'Updates & Guide', a: 'The Update Log is a full, in-depth changelog of every patch, newest first. It lives on the main menu rather than in a tab, so you can read it without loading a save — press Menu in the top bar to get back to the title screen and open it from there. This Guide covers every game system and is under More in the top navigation.' },
            { q: 'Leaderboard (Ranking)', a: 'Global rankings on the Ranking tab, viewable by everyone, signed in or not. Sign in and your club publishes itself: every change to your squad, trophies, cards or Blue Essence reaches the board within about a minute, with no button to press. Rank by trophies, power, Golden Roads, Worlds, splits, tower, cards, level or Blue Essence — each one fetches the real top 50 for that column, and the board refreshes itself every minute. Click any manager to open their profile.' },
            { q: 'Cloud Save', a: 'Sign in to save/load progress across devices. Compatible with the old v1 website — all cards, squad, and stats transfer.' },
            { q: 'Settings', a: 'Open Settings from the gear button at the top right (on a phone, at the bottom of the menu) or from the main menu. Account: sign in and cloud backup. Display: theme, player photos (off by default while photos are still being added) and match lineups. Sound: sound effects and volume. Redeem code. Data & saves: how saving works and Wipe All Local Data. Display and sound settings belong to this device and are kept across save slots.' },
        ]},
        { id: 'msi-history', icon: 'waves', title: 'MSI History', content: [
            { q: 'What is MSI?', a: 'The Mid-Season Invitational (MSI) is Riot\'s annual international tournament held between spring and summer splits. Champions from each major region compete. MSI cards are ultra-rare event cards obtainable only from the MSI pack (5,000 BE / 3,500 BE during event).' },
            { q: '2026 MSI — Hanwha Life Esports (Champion)', a: 'Region: LCK · Roster: Zeus, Kanavi, Zeka, Gumayusi, Delight, Mowgli (coach) · Result: HLE beat Bilibili Gaming 3-2 in the final for a third straight LCK MSI title. Zeus was named Finals MVP; Zeka was the standout statistical performer. Cards: 9224–9229 (MSI quality).' },
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
            { q: 'MSI Pack Drop Rates', a: '0.5% MSI · 1% Challenger · 2% Grandmaster · 5% Master · 15% Diamond · 26.5% Platinum · 50% Gold. Pack cost: 5,000 BE. During an MSI event the pack is discounted and a pity system guarantees an MSI card within 70 pulls. The Store always shows the exact current rates, including your Scouting bonus.' },
            { q: 'MSI 2026 Event Code', a: 'Redeem code MSI2026 in Settings → Redeem code for a free Signature MSI card. Once per save slot.' },
        ]},
        { id: 'ewc-history', icon: 'medal', title: 'EWC History', content: [
            { q: 'What is the EWC?', a: 'The Esports World Cup (EWC) is the annual summer international tournament held in Riyadh, where top teams from every region compete for a massive prize pool. EWC cards are premium event cards of the winning roster — each is a strictly upgraded edition of that player\'s base card, so it\'s always worth chasing. Obtainable only from the EWC pack (4,000 BE).' },
            { q: '2024 EWC — T1 (Inaugural Champions)', a: 'Region: LCK · Roster: Zeus, Oner, Faker, Gumayusi, Keria, kkOma (coach) · Result: T1 win the first-ever EWC, beating Top Esports 3-1 in the final. Faker was named Finals MVP; Gumayusi was a standout, playing 10 different champions across 10 games. Faker & Gumayusi get the biggest upgrades. Cards: 9600–9605 (EWC quality).' },
            { q: '2025 EWC — Gen.G (Champions)', a: 'Region: LCK · Roster: Kiin, Canyon, Chovy, Ruler, Duro, Kim (coach) · Result: Gen.G go undefeated with a 26-match win streak, taking the title back-to-back with MSI just a week earlier. Kiin earned the Finals MVP. The whole roster was dominant, so all five get strong upgrades — Kiin the largest. Cards: 9606–9611 (EWC quality).' },
            { q: '2026 EWC — Dplus KIA (Champions)', a: 'Region: LCK · Roster: Siwoo, Lucid, ShowMaker, Smash, Career, cvMax (coach) · Result: A Cinderella championship run from DK\'s young core led by veteran mid ShowMaker. The breakout title lifts the whole roster well above their base cards. Cards: 9612–9617 (EWC quality).' },
            { q: 'EWC Pack Drop Rates', a: 'Base: 0.5% EWC · 1% Challenger · 2% Grandmaster · 5% Master · 15% Diamond · 26.5% Platinum · 50% Gold. Signature is 0.1% per card, Holographic is 1% per card. Pack cost: 4,000 BE. During the EWC 2026 event (one week): boosted rates (2% EWC), the pack is discounted to 3,000 BE, and a pity system guarantees an EWC card within 100 pulls.' },
        ]},
        { id: 'card-coverage', icon: 'map', title: 'Card Coverage', content: [] },
        // Rendered from utils/updates.js — the same list the main menu's Update Log reads, so the
        // Guide can never fall behind it again (it used to stop at 1.6.8.1).
        { id: 'changelog', icon: 'quests', title: 'Recent Updates', content: [] },
    ];

    // ── Navigation + search ──
    const SECTION_IDS = sections.map(s => s.id);
    let active = 'getting-started';
    let query = '';
    let bodyTop;

    function go(id) {
        active = SECTION_IDS.includes(id) ? id : 'getting-started';
        query = '';
        if (bodyTop && typeof window !== 'undefined' && bodyTop.getBoundingClientRect().top < 0) {
            bodyTop.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Search runs over every written article (plus the release notes), case-insensitively,
    // on every word: "golden road reward" finds the article holding all three.
    const RELEASES = UPDATES.slice(0, 8);
    const INDEX = [
        ...sections.flatMap(s => s.content.map(item => ({ section: s, item, text: `${item.q} ${item.a}`.toLowerCase() }))),
        ...RELEASES.map(u => ({ section: sections.find(s => s.id === 'changelog'), item: { q: `${u.ver} — ${u.title}`, a: [u.summary, ...u.details].join('\n') }, text: `${u.ver} ${u.title} ${u.summary} ${u.details.join(' ')}`.toLowerCase() })),
    ];
    const TOTAL = INDEX.length;
    $: words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    $: results = words.length ? INDEX.filter(e => words.every(w => e.text.includes(w))).slice(0, 40) : [];
    $: current = sections.find(s => s.id === active) || sections[0];

    function esc(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    // Highlight the search words inside already-escaped text. The terms are regex-escaped too.
    function mark(t, ws) {
        let out = esc(t);
        for (const w of ws) {
            if (w.length < 2) continue;
            const re = new RegExp(`(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            out = out.replace(re, '<mark>$1</mark>');
        }
        return out;
    }
    const QUICK = [
        { id: 'getting-started', label: 'First steps' },
        { id: 'season', label: 'How a split works' },
        { id: 'tournaments', label: 'Qualifying & Golden Road' },
        { id: 'squad', label: 'Chemistry & Power' },
    ];
</script>

<section class="gd">
    <!-- ── Hero + search ── -->
    <header class="hero">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-text">
            <span class="eyebrow"><Icon name="guide" size={13} stroke={2.2} /> Game Guide</span>
            <h2 class="title">How everything works</h2>
            <p class="sub">{TOTAL} articles across {sections.length} topics. Search them all, or pick a topic.</p>
            <label class="search">
                <Icon name="search" size={16} />
                <input type="search" bind:value={query} placeholder="Search the guide — e.g. golden road, chemistry, hot deal" aria-label="Search the guide">
                {#if query}<button class="search-x" on:click={() => (query = '')} aria-label="Clear search"><Icon name="close" size={13} stroke={2.4} /></button>{/if}
            </label>
            <div class="quick">
                {#each QUICK as q (q.id)}
                    <button class="qk" on:click={() => go(q.id)}>{q.label}</button>
                {/each}
            </div>
        </div>
    </header>

    <div class="layout" bind:this={bodyTop}>
        <!-- ── Topics ── -->
        <nav class="toc" aria-label="Guide topics">
            {#each sections as s (s.id)}
                <button class="toc-btn" class:toc-on={!words.length && active === s.id} on:click={() => go(s.id)}>
                    <Icon name={s.icon} size={15} />
                    <span class="toc-label">{s.title}</span>
                    <span class="toc-n">{s.id === 'changelog' ? RELEASES.length : s.id === 'card-coverage' ? '' : s.content.length}</span>
                </button>
            {/each}
        </nav>

        <!-- ── Reading pane ── -->
        <div class="pane">
            {#if words.length}
                <div class="pane-head">
                    <h3 class="pane-title">{results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No results'}</h3>
                    <p class="pane-sub">{results.length ? `for “${query.trim()}”` : `Nothing matches “${query.trim()}”. Try fewer or shorter words.`}</p>
                </div>
                {#each results as r, i (i)}
                    <article class="art">
                        <button class="art-from" on:click={() => go(r.section.id)}><Icon name={r.section.icon} size={12} /> {r.section.title}</button>
                        <h4 class="art-q">{@html mark(r.item.q, words)}</h4>
                        <p class="art-a">{@html mark(r.item.a, words)}</p>
                    </article>
                {/each}
            {:else}
                <div class="pane-head">
                    <span class="pane-ico"><Icon name={current.icon} size={20} /></span>
                    <div>
                        <h3 class="pane-title">{current.title}</h3>
                        <p class="pane-sub">
                            {#if current.id === 'changelog'}The latest {RELEASES.length} releases. The full history is on the main menu's Update Log.
                            {:else if current.id === 'card-coverage'}Which regions and years are in the game, and every special card type.
                            {:else}{current.content.length} article{current.content.length === 1 ? '' : 's'}{/if}
                        </p>
                    </div>
                </div>

                {#if current.id === 'card-coverage'}
                    <div class="cov-wrap">
                        <h4 class="cov-head">Regular Cards by Region & Year</h4>
                        <p class="cov-sub">2018–2023 have LCK/LPL/LEC Summer Split rosters (main teams + head coaches, rated to that season's real performance). 2017 is the only remaining gap for the three major regions — Legacy event cards (Champion, MSI) cover it.</p>
                        <div class="cov-scroll">
                            <table class="cov-table">
                                <thead>
                                    <tr>
                                        <th class="cov-th cov-th-left">Region</th>
                                        {#each COV_YEARS as yr}<th class="cov-th">{yr.slice(2)}</th>{/each}
                                        <th class="cov-th cov-th-left">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each regionData as row}
                                        <tr>
                                            <td class="cov-region">{row.r}</td>
                                            {#each COV_YEARS as yr}
                                                <td class="cov-cell" class:cov-yes={row.years.includes(yr)} class:cov-no={!row.years.includes(yr)}>{row.years.includes(yr) ? '✓' : '—'}</td>
                                            {/each}
                                            <td class="cov-note-cell">{row.note}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>

                        <h4 class="cov-head cov-head-2">Special & Tournament Cards</h4>
                        <p class="cov-sub">Legacy tiers (Champion, MVP, Finalist, MSI, FirstStand, EWC) sit in the "Legacy" region and bypass era and region chemistry as wildcards. Award and Hall of Legends cards do not.</p>
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
                {:else if current.id === 'changelog'}
                    {#each RELEASES as u, i (u.ver)}
                        <article class="art art-rel">
                            <div class="rel-top"><span class="rel-ver" class:rel-new={i === 0}>{u.ver}</span><h4 class="art-q">{u.title}</h4></div>
                            <p class="art-a">{u.summary}</p>
                            <ul class="rel-list">
                                {#each u.details as d}<li>{d}</li>{/each}
                            </ul>
                        </article>
                    {/each}
                    <button class="more" on:click={() => openUpdates('game')}><Icon name="quests" size={14} /> Open the full Update Log</button>
                {:else}
                    {#each current.content as item (item.q)}
                        <article class="art">
                            <h4 class="art-q">{item.q}</h4>
                            <p class="art-a">{item.a}</p>
                        </article>
                    {/each}
                {/if}

                <!-- Prev / next keeps a reader moving without scrolling back to the topic list. -->
                {@const idx = SECTION_IDS.indexOf(current.id)}
                <div class="pager">
                    {#if idx > 0}<button class="pg" on:click={() => go(SECTION_IDS[idx - 1])}><Icon name="chevron" size={13} stroke={2.4} /> {sections[idx - 1].title}</button>{:else}<span></span>{/if}
                    {#if idx < SECTION_IDS.length - 1}<button class="pg pg-next" on:click={() => go(SECTION_IDS[idx + 1])}>{sections[idx + 1].title} <Icon name="chevron" size={13} stroke={2.4} /></button>{/if}
                </div>
            {/if}
        </div>
    </div>
</section>

<style>
    .gd { display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; }

    /* ── Hero ── */
    .hero {
        position: relative; overflow: hidden; padding: 24px 28px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(167,139,250,0.16), transparent 65%), linear-gradient(120deg, #110d1f, #0b0e1a 60%);
        border: 1px solid rgba(167,139,250,0.28);
    }
    .hero-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(96,165,250,0.1), transparent 65%); }
    .hero-text { position: relative; max-width: 760px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #c4b5fd; }
    .title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .search { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding: 12px 14px; border-radius: 14px; background: rgba(2,6,23,0.6); border: 1px solid rgba(148,163,184,0.25); color: #94a3b8; }
    .search:focus-within { border-color: rgba(167,139,250,0.7); box-shadow: 0 0 0 3px rgba(167,139,250,0.15); }
    .search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: #f1f5f9; font-size: 14px; font-family: inherit; }
    .search-x { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 8px; border: none; cursor: pointer; color: #94a3b8; background: rgba(51,65,85,0.5); }
    .quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .qk { padding: 6px 12px; border-radius: 100px; cursor: pointer; font-size: 12px; font-weight: 800; color: #c4b5fd; background: rgba(124,58,237,0.12); border: 1px solid rgba(167,139,250,0.3); }
    .qk:hover { background: rgba(124,58,237,0.22); color: #fff; }

    /* ── Layout ── */
    .layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; scroll-margin-top: 90px; }
    .toc { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 18px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); max-height: calc(100vh - 110px); overflow-y: auto; }
    .toc-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 11px; border-radius: 11px; border: none; cursor: pointer; text-align: left; background: transparent; color: #94a3b8; font-size: 13px; font-weight: 700; }
    .toc-btn:hover { background: rgba(51,65,85,0.35); color: #e2e8f0; }
    .toc-on, .toc-on:hover { background: rgba(124,58,237,0.18); color: #fff; }
    .toc-on :global(.ico) { color: #c4b5fd; }
    .toc-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toc-n { font-size: 10.5px; font-weight: 800; color: #475569; }

    .pane { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .pane-head { display: flex; align-items: center; gap: 12px; padding: 4px 2px 6px; }
    .pane-ico { width: 42px; height: 42px; border-radius: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #c4b5fd; background: rgba(124,58,237,0.16); border: 1px solid rgba(167,139,250,0.3); }
    .pane-title { font-size: 20px; font-weight: 900; color: #fff; }
    .pane-sub { font-size: 12.5px; color: #64748b; margin-top: 2px; }

    .art { padding: 16px 18px; border-radius: 16px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .art-from { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 6px; padding: 2px 9px; border-radius: 100px; border: none; cursor: pointer; font-size: 10.5px; font-weight: 800; color: #c4b5fd; background: rgba(124,58,237,0.14); }
    .art-q { font-size: 14.5px; font-weight: 900; color: #e2e8f0; }
    .art-a { margin-top: 6px; font-size: 13px; line-height: 1.7; color: #94a3b8; white-space: pre-line; }
    .art :global(mark) { background: rgba(250,204,21,0.25); color: #fef9c3; border-radius: 3px; padding: 0 2px; }

    .rel-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .rel-ver { font-size: 10.5px; font-weight: 900; padding: 3px 9px; border-radius: 6px; color: #67e8f9; background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.25); white-space: nowrap; }
    .rel-new { color: #052e16; background: #34d399; border-color: #34d399; }
    .rel-list { margin: 10px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
    .rel-list li { font-size: 12.5px; line-height: 1.6; color: #8b9ab0; }
    .more { align-self: flex-start; display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 12px; cursor: pointer; font-size: 12.5px; font-weight: 800; color: #67e8f9; background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.3); }

    .pager { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; }
    .pg { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 12px; cursor: pointer; font-size: 12.5px; font-weight: 800; color: #94a3b8; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.3); }
    .pg:first-child :global(.ico) { transform: rotate(180deg); }
    .pg-next :global(.ico) { transform: none !important; }
    .pg:hover { color: #fff; border-color: rgba(167,139,250,0.5); }

    /* Card Coverage Tables */
    .cov-wrap { padding: 16px 18px; border-radius: 16px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .cov-head { font-size: 13px; font-weight: 900; color: #c4b5fd; margin-bottom: 6px; }
    .cov-head-2 { margin-top: 24px; }
    .cov-sub { font-size: 11.5px; color: #64748b; margin-bottom: 12px; line-height: 1.5; }
    .cov-scroll { overflow-x: auto; margin-bottom: 4px; }
    .cov-table { width: 100%; border-collapse: collapse; font-size: 11px; min-width: 420px; }
    .cov-th { padding: 8px 6px; text-align: center; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(51,65,85,0.3); white-space: nowrap; }
    .cov-th-left { text-align: left; }
    .cov-table tbody tr { border-bottom: 1px solid rgba(51,65,85,0.1); }
    .cov-table tbody tr:hover { background: rgba(30,41,59,0.3); }
    .cov-table tbody tr:last-child { border-bottom: none; }
    .cov-region { padding: 9px 12px; font-weight: 900; font-size: 12px; color: #e2e8f0; white-space: nowrap; }
    .cov-cell { padding: 9px 4px; text-align: center; font-weight: 900; font-size: 12px; }
    .cov-yes { color: #34d399; }
    .cov-no { color: #334155; }
    .cov-note-cell { padding: 9px 12px; font-size: 10px; color: #64748b; white-space: nowrap; }
    .cov-type { padding: 9px 12px; font-weight: 700; font-size: 11px; color: #cbd5e1; white-space: nowrap; }
    .cov-badge-cell { padding: 9px 8px; text-align: center; }
    .cov-years-cell { padding: 9px 12px; font-size: 10px; color: #94a3b8; white-space: nowrap; }
    .cov-teams-cell { padding: 9px 12px; font-size: 10px; color: #64748b; }
    .cov-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
    /* Mythic — red/gold on black, the only tier that gets a gradient */
    .cov-q-halloflegends { background: linear-gradient(135deg, #0a0a0a 0%, rgba(255,0,51,0.35) 100%); color: #f5c542; border: 1px solid rgba(255,0,51,0.55); }
    .cov-q-champion  { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .cov-q-mvp       { background: rgba(249,115,22,0.15); color: #fb923c; border: 1px solid rgba(249,115,22,0.3); }
    .cov-q-finalist  { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
    .cov-q-msi       { background: rgba(6,182,212,0.15);  color: #22d3ee; border: 1px solid rgba(6,182,212,0.3); }
    .cov-q-firststand{ background: rgba(20,184,166,0.15); color: #2dd4bf; border: 1px solid rgba(20,184,166,0.3); }
    .cov-q-ewc       { background: rgba(255,210,74,0.15); color: #ffd24a; border: 1px solid rgba(255,210,74,0.3); }
    .cov-q-poty      { background: rgba(234,179,8,0.15);  color: #facc15; border: 1px solid rgba(234,179,8,0.35); }
    .cov-q-toty      { background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3); }
    .cov-q-roty      { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }

    @media (max-width: 900px) {
        .layout { grid-template-columns: 1fr; }
        .toc { position: static; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; max-height: none; scrollbar-width: none; }
        .toc::-webkit-scrollbar { display: none; }
        .toc-btn { width: auto; flex-shrink: 0; }
        .toc-n { display: none; }
        .toc-label { overflow: visible; }
    }
    @media (max-width: 620px) {
        .hero { padding: 20px; }
        .art { padding: 14px; }
    }
</style>
