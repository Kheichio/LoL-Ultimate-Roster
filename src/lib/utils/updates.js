// Shared source for the changelog surfaces.
//
// The Home page shows a short preview (the newest few, `summary` only) and the dedicated
// Updates tab shows the full list with every `details` bullet — both read from here, so a
// release is described in one place instead of being copy-pasted into the Home island.
// (The Guide tab keeps its own FAQ-style "Update Log" section.) Newest first.

export const UPDATES = [
    {
        ver: 'Beta 1.4.0',
        title: 'Summer Splits 2018–2020',
        summary: '637 new Summer Split cards (2018–2020), redesigned EWC / Champion / Team of the Year cards, and a league-wide stat rebalance.',
        details: [
            'NEW CARDS — 637 of them: complete LCK, LPL and LEC Summer Split rosters for 2018, 2019 and 2020 (main teams + head coaches, no academies). Every player is rated to that split\'s real performance, so the best performers rank highest — Uzi & Rookie (2018), the DAMWON 2020 Worlds core, and the G2 / FPX super-teams of 2019 sit at the top, while off-years (e.g. SKT missing the 2018 playoffs) are reflected too. Region tags: LCK / LPL / LEC (2018 EU teams tagged LEC).',
            'CARD REDESIGNS — EWC cards became a brushed gold-and-emerald "Trophy Forge" frame; Champion cards an imperial purple-and-gold "coronation"; Team of the Year an all-star platinum chrome. Diamond cards now use dark text (no more mixups with coach cards) and the Grandmaster red is softer on the eyes.',
            'EWC 2026 (Dplus KIA) buffed — Smash and ShowMaker headline the upgrades, with the whole roster raised to match their Cinderella run.',
            'BENCH — the bench picker now shows every eligible card with role filters and sort-by-any-stat (rating or MEC/TMF/FRM/CMP/MAP/LDR).',
            'GOLDEN ROAD — the final Worlds stage is now capped at 120 total power, so a fully-built squad can realistically finish the gauntlet.',
            'BALANCE — a league-wide pass so every card\'s rating lines up with its stats: an elite 98–100 stat now only appears on elite-rated cards, and coach Mechanics are consistent across the board.',
        ],
    },
    {
        ver: 'Beta 1.3.4',
        title: 'Transfer Market',
        summary: 'The Trade tab is now a fully transparent Transfer Market — you always see exactly which player you\'re signing.',
        details: [
            'TRANSFER MARKET — the Trade tab now shows exactly which player you\'re signing (no more mystery). A randomised board of 6 real listings refreshes every 15 minutes; each can be signed once per rotation. Cost (spare cards + Blue Essence) scales with the player\'s tier, from Gold all the way up to Challenger and Legacy/Award cards.',
        ],
    },
    {
        ver: 'Beta 1.3.0',
        title: 'RBCs & EWC',
        summary: 'Roster Building Challenges, Esports World Cup champion cards, and a reworked Mystery Trade market.',
        details: [
            'NEW MODE — Roster Building Challenges (RBCs): a new tab between Academy and Season. Complete daily themed 5-player challenges by submitting cards from your Club — the cards are consumed and you earn 5 free packs to open in the Store. Five challenges (difficulty 1–5) with rewards scaling from Premium packs up to full EWC packs. Everything resets at midnight.',
            'NEW CARDS — Esports World Cup (EWC) champions: EWC 2024 (T1), EWC 2025 (Gen.G) and EWC 2026 (Dplus KIA). Each EWC card is a strictly upgraded edition of that player\'s base card, scaled to their run. New EWC card tier plus an EWC Store pack (4,000 BE).',
            'TRADE MARKET REWORKED — trades are finally worth doing. The new Mystery Trades consume your spare cards plus Blue Essence for ONE fully random player, guaranteed Master tier or higher, all the way up to Legacy & Award cards. Three tiers with escalating cost and better odds.',
            'UI — Friends moved up next to Ranking so the top nav is balanced; Home career stats reordered by prestige (Golden Road → Worlds → MSI → First Stand → Regional → Splits) with a unique colour each; team colour is now far more visible on the Home page panels.',
        ],
    },
    {
        ver: 'Beta 1.2.3',
        title: 'Fixes & Accessibility',
        summary: 'Transfer Network & Wealth fixes, a daily-login streak bonus, cloud-save reliability, and full accessibility support.',
        details: [
            'FIXED — the Transfer Network skill now actually boosts your sell prices (+5% per level). It was doing nothing before — check your Skills tab!',
            'Wealth Management now also boosts Blue Essence from card sells and daily logins, not just tournament and quest rewards.',
            'NEW — Daily Login streak bonus: every consecutive day you claim grants escalating bonus BE, up to +1,500 at a 30-day streak.',
            'FIXED — Cloud saves no longer drop your Prestige, daily streak, bench, or Showcase, and now validate your roster on load just like local saves.',
            'Accessibility & mobile: full keyboard navigation with focus-trapped menus, visible focus outlines, reduced-motion support, and pinch-to-zoom is re-enabled on phones.',
            'Under the hood: unified match chemistry logic for more consistent balance, plus dead-code cleanup.',
        ],
    },
    {
        ver: 'Beta 1.2.2',
        title: 'Foil & Signature Polish',
        summary: 'Brighter holographic foil, a prestige glow-up for signature cards, and an MSI 2026 (HLE) rebalance.',
        details: [
            '✨ Holographic cards are far easier to spot — the rainbow foil is now brighter and more opaque, and a soft pale wash lifts the base tier colour so the shimmer reads clearly on every card.',
            'Signature cards got a prestige glow-up — a bright white light-sweep glides across the card face and the border shimmers white → gold.',
            'MSI 2026 (HLE) rebalanced — the MSI-champion versions of Zeus, Kanavi, Zeka, Gumayusi and Delight now beat their base 2026 cards on every stat, scaled up to their title-winning run.',
        ],
    },
    {
        ver: 'Beta 1.2.1',
        title: 'Friend List',
        summary: 'The Friends tab arrives — add managers by name, challenge their squads, and sync friendships across devices.',
        details: [
            'FRIEND LIST — a brand-new Friends tab! Search for other managers by their exact display name and send them a friend request.',
            'Accept or decline incoming requests, cancel outgoing ones, and remove friends whenever you like — a header badge shows how many requests are waiting.',
            'View a friend\'s team and synced squad, or challenge them straight to a Tournament match against their saved five.',
            'Friendships sync live across your devices (sign-in required).',
        ],
    },
    {
        ver: 'Beta 1.2',
        title: 'Academy & Auto-Farming',
        summary: 'An Academy auto-farming team, Club bulk-sell tools, and MSI 2026 champions (HLE).',
        details: [
            'ACADEMY TEAM — a new tab next to Squad, unlocked after you win Worlds. Field a second five (separate from your main squad) and send them to auto-farm once every hour for Blue Essence and XP that scale with the team\'s rating. The roster locks while a run is training; collect your rewards when the hour is up. Assigned players are protected from selling.',
            'Club Vault — Quick Sell by tier: one click bulk-sells every card of a chosen tier (Bronze through Challenger) after a confirmation. Locked, favourited, squad, and academy cards are always kept.',
            'Club Vault — Sell Duplicates: instantly sell every extra copy of a player while keeping your best one.',
            'Challenger cards can no longer be crafted — the Upgrade Lab now tops out at Grandmaster, and the Trade Market\'s Diamond/Master/Grandmaster → Challenger recipes were removed. Challenger cards are still obtainable from packs.',
            'MSI 2026 — Hanwha Life Esports crowned champions, beating Bilibili Gaming 3-2 with Zeus as Finals MVP. Their winning roster is now in the game as MSI cards: Zeus, Kanavi, Zeka, Gumayusi, Delight + Mowgli (coach). Cards 9224–9229.',
            'Global Leaderboard is now public — browse the rankings without signing in. Sign in to add your own team to the board.',
            'Softer Bronze card art — the harsh dark-brown bronze tier now uses a warmer, lighter finish.',
            'Tabs: "Board" renamed to "Ranking"; the Rewards tab moved up next to Quests.',
        ],
    },
    {
        ver: 'Beta 1.1.6',
        title: 'Public Build',
        summary: 'MSI 2015 EDG cards (the inaugural champions) and a full Card Coverage table added to the Guide.',
        details: [
            'MSI 2015 EDG cards added — 6 new cards from the INAUGURAL MSI champion (ClearLove, PawN, Deft, Meiko, Koro1, Aaron). Stats based on real tournament data: ClearLove had 10.0 KDA (best in tournament), Finals MVP.',
            '2015 is now the earliest year with MSI coverage — 2015 was the first ever MSI (no earlier tournaments exist).',
            'Guide: Card Coverage table updated to show MSI 2015–2025 (no 2020), MSI History section updated with 2015 entry.',
            'Leaderboard power now correctly includes Conditioning skill bonus (fixes Squad vs Leaderboard mismatch).',
            'Card Coverage by Region & Year table added to Guide — shows which years each region is in the game, and all special card types with packs, years, and teams.',
        ],
    },
    {
        ver: 'Beta 1.1.5',
        title: 'Real-Data MSI Cards',
        summary: '12 MSI champion cards built from real tournament data, Battle Pass Claim All, anti-cheat, and Infinity Tower scaling.',
        details: [
            'Battle Pass: Claim All button — collect every unlocked reward in one click.',
            '12 new MSI champion cards based on real tournament data: SKT T1 2017 MSI (Huni/Peanut/Faker/Bang/Wolf/kkOma) and SKT T1 2016 MSI (Duke/Blank/Faker/Bang/Wolf/kkOma) — stats derived from actual KDA, damage share, and kill participation.',
            'MSI 2026 Event extended to July 12 — boosted drop rates, 3,500 BE pack price.',
            'New promo code: MSI2026 — free Signature MSI card (account panel).',
            'Guide: MSI History section with year-by-year champion rosters, real stats, and card IDs.',
            'Salary Cap flex picks: any card can fill any role at 25% salary discount + −10% stat debuff.',
            'Wealth Management: +X% BE badge in header, bonus shown in all reward toasts.',
            'Anti-cheat: save integrity hash, card stat validation on load, Firebase leaderboard security rules.',
            'Unique team names auto-generated for new players (no more duplicate "My Team" on leaderboard).',
            'Infinity Tower: starts at Gold tier, scales infinitely past floor 20 with no cap.',
            'Leaderboard now shows Blue Essence as a sortable column.',
        ],
    },
    {
        ver: 'Beta 1.1.2',
        title: 'Awards, Salary Cap & Prestige',
        summary: 'League Award cards (POTY/TOTY/ROTY), Salary Cap Mode, the Rival Challenge, and the Prestige system.',
        details: [
            'League Awards 2024 & 2025 cards: POTY (Faker, Chovy), TOTY (T1 full lineup both years), ROTY (Massu, HongQ) — 14 new ultra-rare cards.',
            'Awards Vault pack: 12,000 BE · 0.25% POTY · 1% TOTY · 3% ROTY — rarest pack in the game.',
            'Salary Cap Mode: Build a 50,000 CAP squad from your club. Cards priced by rating. Beat elite opponents for 8,000 BE.',
            'Rival Challenge: Fight another leaderboard player\'s saved squad. 3-match series, 3,000 BE reward.',
            'Prestige System: Reach Manager Lv 100 to Prestige. Resets XP/Skills, keeps all cards/BE/trophies. ⭐ badge in header.',
            'Career Milestone Cards: Earn special cards for achievements (First Worlds, Golden Road, Tower 100, etc.) Shown on Home page.',
            'Coming Soon updated: Friend List, Player Form System.',
        ],
    },
    {
        ver: 'Beta 1.1.1.2',
        title: 'Quests & Draft Fixes',
        summary: '55 milestone quests, 25 achievements, and a batch of Draft Mode fixes.',
        details: [
            '55 milestone quests (was 39), 10 repeatable contracts (was 7), 25 achievements (was 17).',
            'New Draft Mode quests: Win/Play Draft milestones + repeatable contract.',
            'New economy quests: Perform 10/50 Upgrades.',
            'Higher-tier competitive goals: Win 10 First Stands, Win 5 MSIs, Win 5 Worlds, Win 100 Cafes.',
            'New achievements: 98+ Squad Avg, Manager Lv 100, Tower Floor 200, Own 1000 Cards, Win 10/50 Drafts.',
            'Draft Mode: cards now sort by natural role when picking for a position.',
            'Draft Mode: card clicks work properly for banning and picking (no more inspect popup).',
            'Draft Mode: squad cards displayed on sides during match phase.',
            'MSI event pity counter now updates live after each pack open.',
            'ON (BLG) 2026 FirstStand card buffed to 97 to match base card.',
        ],
    },
    {
        ver: 'Beta 1.1.0',
        title: 'Draft Mode',
        summary: 'Draft Mode, the MSI 2026 limited event, the Wealth Management skill, and a Conditioning fix.',
        details: [
            'DRAFT MODE — New gamemode! 15 random cards, 5 bans each side, build a squad, best of 5. Off-role flex penalty (-10 stats), legacy cards are wildcards.',
            'MSI 2026 LIMITED EVENT — 24hr global event with boosted MSI pack drop rates + guaranteed MSI card pity at 70 pulls.',
            'Wealth Management skill: +10% bonus BE from all rewards per level (max 5).',
            'Conditioning skill now works: +1 total power per level across all modes.',
            'Dynamic milestones on Home page, Legacy card tracker, Career stats expanded.',
            'Card Showcase moved to Club with drag-and-drop reordering.',
            'Archive completion uses full team size, Coming Soon gamemodes in Play tab.',
        ],
    },
    {
        ver: 'Beta 1.0.9.2',
        title: 'Showcase & Combat Overhaul',
        summary: 'Card Showcase, split squad-lock with bench swaps, and a combat UI overhaul.',
        details: [
            'Card Showcase with drag-and-drop in Club Vault.',
            'Squad locks during active season splits — bench swaps only.',
            'Bench Management skill (max 3) for mid-split player swaps.',
            'Combat UI overhaul: Power bar, Stat vs Net split, full log breakdown.',
            'Upgrade Lab notification badges per tier and role.',
            'Battle Pass auto-levels, Leaderboard autosync, Redeem codes.',
            'Player ratings updated for 2025-2026 based on real performance data.',
        ],
    },
    {
        ver: 'Beta 1.0.9.1',
        title: 'Quest Badges & Persistent Cooldowns',
        summary: 'Quest notification badges, stacking contracts, persistent split cooldowns, and an expanded meta.',
        details: [
            'Trades lock instantly after completing — no repeat claims.',
            'Quest sub-tabs show notification badges for claimable rewards.',
            'Repeatable contracts stack — excess progress carries over.',
            'Archive claim buttons moved inside sub-tabs.',
            'Battle Pass XP earned from all gameplay modes.',
            'Tactical Mastery bonus visibly applied in combat.',
            'Season split cooldown timer persists across tabs and page reloads.',
            'Header cooldown timer chip — click to jump to Season tab.',
            'Expanded meta: 5 buffed, 12 slumping teams per phase.',
            'CPU team generation enforces rating caps.',
            'Gaming Cafe capped at 78 power, Regional Trophy at 93.',
            '39 milestones, 7 contracts, 17 achievements.',
            'Leaderboard shows other players\' squads and showcase.',
            'Archive rewards: per-card discovery + team completion.',
            'Notification badges on Archive, Quests, Skills, Rewards tabs.',
        ],
    },
    {
        ver: 'Beta 1.0.7',
        title: 'Era Synergy, Tower & Battle Pass',
        summary: 'Era synergy, Signature/Holographic cards, Infinity Tower, Golden Road, and the 100-tier Battle Pass.',
        details: [
            'Era synergy replaces year synergy (6 eras grouping years into 3-year blocks).',
            'Signature cards +2 all stats/rating, Holographic +1, stackable, can exceed 99.',
            'Pack preview shows exact drop rates with scouting bonus.',
            '3-column combat layout with 2×3 card grids.',
            'Infinity Tower: endless floors, roguelike upgrades, persistent runs.',
            'Golden Road: 4-stage tournament gauntlet with 30-min cooldown.',
            'Trade Market with 15-min rotation and skill-based scaling.',
            'Daily Login (28-day cycle) and 100-tier Battle Pass.',
            'Manager XP system with central grantXP function across all modes.',
        ],
    },
];

// The newest N updates, for the Home page preview island.
export function recentUpdates(n = 3) {
    return UPDATES.slice(0, n);
}
