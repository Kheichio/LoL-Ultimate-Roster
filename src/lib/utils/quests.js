import { CHALLENGES } from './rbc.js';
import { getEffectiveRating } from './cards.js';

// Quest definitions — shared by the Quests tab and the Header's claimable badge, so a new
// quest can never be counted by one and ignored by the other.
// Ordering rule for all three lists: category first (in `questCategories` order),
// then one contiguous run per stat, then ascending target so a progression always
// reads 1 → 5 → 25. Rewards scale with the threshold, never with insertion order.
// IDs are persisted in the player's save — never rename one, only append new ones.
export const milestoneQuests = [
    // === Collection ===
    { id: 'mq1', cat: 'collection', desc: 'Open 5 Card Packs', target: 5, stat: 'packs', reward: 500 },
    { id: 'mq2', cat: 'collection', desc: 'Open 25 Card Packs', target: 25, stat: 'packs', reward: 2000 },
    { id: 'mq3', cat: 'collection', desc: 'Open 100 Card Packs', target: 100, stat: 'packs', reward: 5000 },
    { id: 'mq9', cat: 'collection', desc: 'Open 250 Card Packs', target: 250, stat: 'packs', reward: 10000 },
    { id: 'mq60', cat: 'collection', desc: 'Open 500 Card Packs', target: 500, stat: 'packs', reward: 20000 },
    { id: 'mq4', cat: 'collection', desc: 'Pull a Holographic Card', target: 1, stat: 'holographicPulled', reward: 2000 },
    { id: 'mq5', cat: 'collection', desc: 'Pull 5 Holographic Cards', target: 5, stat: 'holographicPulled', reward: 5000 },
    { id: 'mq8', cat: 'collection', desc: 'Pull 10 Holographic Cards', target: 10, stat: 'holographicPulled', reward: 8000 },
    { id: 'mq61', cat: 'collection', desc: 'Pull 25 Holographic Cards', target: 25, stat: 'holographicPulled', reward: 15000 },
    { id: 'mq6', cat: 'collection', desc: 'Pull a Signature Card', target: 1, stat: 'signaturesPulled', reward: 3000 },
    { id: 'mq7', cat: 'collection', desc: 'Pull 5 Signature Cards', target: 5, stat: 'signaturesPulled', reward: 8000 },
    { id: 'mq62', cat: 'collection', desc: 'Pull 10 Signature Cards', target: 10, stat: 'signaturesPulled', reward: 15000 },
    // === Economy ===
    { id: 'mq10', cat: 'economy', desc: 'Sell 10 Cards', target: 10, stat: 'soldCount', reward: 400 },
    { id: 'mq11', cat: 'economy', desc: 'Sell 50 Cards', target: 50, stat: 'soldCount', reward: 1500 },
    { id: 'mq12', cat: 'economy', desc: 'Sell 200 Cards', target: 200, stat: 'soldCount', reward: 4000 },
    { id: 'mq13', cat: 'economy', desc: 'Sell 500 Cards', target: 500, stat: 'soldCount', reward: 8000 },
    { id: 'mq63', cat: 'economy', desc: 'Perform 10 Upgrades', target: 10, stat: 'upgradesPerformed', reward: 3000 },
    { id: 'mq64', cat: 'economy', desc: 'Perform 50 Upgrades', target: 50, stat: 'upgradesPerformed', reward: 10000 },
    { id: 'mq80', cat: 'economy', desc: 'Sign a Player from the Transfer Market', target: 1, stat: 'tradesDone', reward: 500 },
    { id: 'mq81', cat: 'economy', desc: 'Complete 10 Transfer Market Signings', target: 10, stat: 'tradesDone', reward: 2500 },
    { id: 'mq82', cat: 'economy', desc: 'Complete 50 Transfer Market Signings', target: 50, stat: 'tradesDone', reward: 8000 },
    // === Competitive ===
    { id: 'mq20', cat: 'competitive', desc: 'Win a Tournament', target: 1, stat: 'tournamentsWon', reward: 800 },
    { id: 'mq21', cat: 'competitive', desc: 'Win 5 Tournaments', target: 5, stat: 'tournamentsWon', reward: 3000 },
    { id: 'mq22', cat: 'competitive', desc: 'Win 25 Tournaments', target: 25, stat: 'tournamentsWon', reward: 8000 },
    { id: 'mq50', cat: 'competitive', desc: 'Win 100 Tournaments', target: 100, stat: 'tournamentsWon', reward: 20000 },
    { id: 'mq23', cat: 'competitive', desc: 'Win a Gaming Cafe', target: 1, stat: 'cafeWins', reward: 500 },
    { id: 'mq24', cat: 'competitive', desc: 'Win 10 Gaming Cafes', target: 10, stat: 'cafeWins', reward: 3000 },
    { id: 'mq25', cat: 'competitive', desc: 'Win 50 Gaming Cafes', target: 50, stat: 'cafeWins', reward: 6000 },
    { id: 'mq73', cat: 'competitive', desc: 'Win 100 Gaming Cafes', target: 100, stat: 'cafeWins', reward: 12000 },
    { id: 'mq26', cat: 'competitive', desc: 'Win a Regional Trophy', target: 1, stat: 'regionalSplitWon', reward: 1000 },
    { id: 'mq27', cat: 'competitive', desc: 'Win 5 Regional Trophies', target: 5, stat: 'regionalSplitWon', reward: 4000 },
    { id: 'mq51', cat: 'competitive', desc: 'Win 25 Regional Trophies', target: 25, stat: 'regionalSplitWon', reward: 10000 },
    { id: 'mq28', cat: 'competitive', desc: 'Win a First Stand', target: 1, stat: 'firstStandWon', reward: 2000 },
    { id: 'mq29', cat: 'competitive', desc: 'Win 5 First Stands', target: 5, stat: 'firstStandWon', reward: 6000 },
    { id: 'mq70', cat: 'competitive', desc: 'Win 10 First Stands', target: 10, stat: 'firstStandWon', reward: 12000 },
    { id: 'mq35', cat: 'competitive', desc: 'Win an MSI', target: 1, stat: 'msiWon', reward: 3000 },
    { id: 'mq36', cat: 'competitive', desc: 'Win 3 MSIs', target: 3, stat: 'msiWon', reward: 8000 },
    { id: 'mq71', cat: 'competitive', desc: 'Win 5 MSIs', target: 5, stat: 'msiWon', reward: 15000 },
    { id: 'mq37', cat: 'competitive', desc: 'Win a World Championship', target: 1, stat: 'worldsWon', reward: 5000 },
    { id: 'mq38', cat: 'competitive', desc: 'Win 3 World Championships', target: 3, stat: 'worldsWon', reward: 12000 },
    { id: 'mq72', cat: 'competitive', desc: 'Win 5 World Championships', target: 5, stat: 'worldsWon', reward: 25000 },
    { id: 'mq68', cat: 'competitive', desc: 'Play 10 Draft Modes', target: 10, stat: 'draftModesPlayed', reward: 3000 },
    { id: 'mq69', cat: 'competitive', desc: 'Play 50 Draft Modes', target: 50, stat: 'draftModesPlayed', reward: 10000 },
    { id: 'mq65', cat: 'competitive', desc: 'Win a Draft Mode', target: 1, stat: 'draftModesWon', reward: 1500 },
    { id: 'mq66', cat: 'competitive', desc: 'Win 5 Draft Modes', target: 5, stat: 'draftModesWon', reward: 5000 },
    { id: 'mq67', cat: 'competitive', desc: 'Win 25 Draft Modes', target: 25, stat: 'draftModesWon', reward: 12000 },
    // === Challenges (Roster Building Challenges) ===
    { id: 'mq90', cat: 'challenges', desc: 'Complete a Roster Building Challenge', target: 1, stat: 'rbcCompleted', reward: 800 },
    { id: 'mq91', cat: 'challenges', desc: 'Complete 10 Roster Building Challenges', target: 10, stat: 'rbcCompleted', reward: 3000 },
    { id: 'mq92', cat: 'challenges', desc: 'Complete 25 Roster Building Challenges', target: 25, stat: 'rbcCompleted', reward: 6000 },
    { id: 'mq93', cat: 'challenges', desc: 'Complete 100 Roster Building Challenges', target: 100, stat: 'rbcCompleted', reward: 15000 },
    { id: 'mq94', cat: 'challenges', desc: 'Complete 250 Roster Building Challenges', target: 250, stat: 'rbcCompleted', reward: 30000 },
    // === Progression ===
    { id: 'mq30', cat: 'progression', desc: 'Complete a Season Split', target: 1, stat: 'splitsCompleted', reward: 2000 },
    { id: 'mq31', cat: 'progression', desc: 'Complete 5 Season Splits', target: 5, stat: 'splitsCompleted', reward: 5000 },
    { id: 'mq32', cat: 'progression', desc: 'Complete 25 Season Splits', target: 25, stat: 'splitsCompleted', reward: 12000 },
    { id: 'mq39', cat: 'progression', desc: 'Complete 50 Season Splits', target: 50, stat: 'splitsCompleted', reward: 20000 },
    { id: 'mq75', cat: 'progression', desc: 'Complete 100 Season Splits', target: 100, stat: 'splitsCompleted', reward: 35000 },
    { id: 'mq33', cat: 'progression', desc: 'Complete a Golden Road', target: 1, stat: 'goldenRoads', reward: 5000 },
    { id: 'mq34', cat: 'progression', desc: 'Complete 5 Golden Roads', target: 5, stat: 'goldenRoads', reward: 15000 },
    { id: 'mq40', cat: 'progression', desc: 'Complete 10 Golden Roads', target: 10, stat: 'goldenRoads', reward: 25000 },
    { id: 'mq76', cat: 'progression', desc: 'Complete 25 Golden Roads', target: 25, stat: 'goldenRoads', reward: 40000 },
    { id: 'mq41', cat: 'progression', desc: 'Reach Tower Floor 10', target: 10, stat: 'towerHighestFloor', reward: 2000 },
    { id: 'mq42', cat: 'progression', desc: 'Reach Tower Floor 25', target: 25, stat: 'towerHighestFloor', reward: 5000 },
    { id: 'mq43', cat: 'progression', desc: 'Reach Tower Floor 50', target: 50, stat: 'towerHighestFloor', reward: 10000 },
    { id: 'mq44', cat: 'progression', desc: 'Reach Tower Floor 100', target: 100, stat: 'towerHighestFloor', reward: 20000 },
    { id: 'mq74', cat: 'progression', desc: 'Reach Tower Floor 200', target: 200, stat: 'towerHighestFloor', reward: 40000 },
];

export const repeatableQuests = [
    // === Collection ===
    { id: 'rq1', cat: 'collection', desc: 'Open 3 Packs', target: 3, stat: 'packs', reward: 300 },
    { id: 'rq6', cat: 'collection', desc: 'Open 5 Packs', target: 5, stat: 'packs', reward: 500 },
    // === Economy ===
    { id: 'rq3', cat: 'economy', desc: 'Sell 5 Cards', target: 5, stat: 'soldCount', reward: 200 },
    { id: 'rq7', cat: 'economy', desc: 'Sell 10 Cards', target: 10, stat: 'soldCount', reward: 300 },
    { id: 'rq10', cat: 'economy', desc: 'Perform 5 Upgrades', target: 5, stat: 'upgradesPerformed', reward: 500 },
    { id: 'rq13', cat: 'economy', desc: 'Complete 3 Transfer Market Signings', target: 3, stat: 'tradesDone', reward: 600 },
    // === Competitive ===
    { id: 'rq2', cat: 'competitive', desc: 'Win 3 Tournaments', target: 3, stat: 'tournamentsWon', reward: 500 },
    { id: 'rq9', cat: 'competitive', desc: 'Win 10 Tournaments', target: 10, stat: 'tournamentsWon', reward: 1200 },
    { id: 'rq4', cat: 'competitive', desc: 'Win 5 Gaming Cafes', target: 5, stat: 'cafeWins', reward: 600 },
    { id: 'rq8', cat: 'competitive', desc: 'Win 2 Draft Modes', target: 2, stat: 'draftModesWon', reward: 700 },
    // === Challenges ===
    { id: 'rq11', cat: 'challenges', desc: 'Complete 3 Roster Building Challenges', target: 3, stat: 'rbcCompleted', reward: 600 },
    { id: 'rq12', cat: 'challenges', desc: 'Complete 10 Roster Building Challenges', target: 10, stat: 'rbcCompleted', reward: 1500 },
    // === Progression ===
    { id: 'rq5', cat: 'progression', desc: 'Complete 2 Season Splits', target: 2, stat: 'splitsCompleted', reward: 800 },
];

export const achievements = [
    // === Collection ===
    { id: 'a4', cat: 'collection', desc: 'Own 50 Cards', type: 'clubSize', target: 50, reward: 1000 },
    { id: 'a5', cat: 'collection', desc: 'Own 200 Cards', type: 'clubSize', target: 200, reward: 4000 },
    { id: 'a6', cat: 'collection', desc: 'Own 500 Cards', type: 'clubSize', target: 500, reward: 8000 },
    { id: 'a18', cat: 'collection', desc: 'Own 1000 Cards', type: 'clubSize', target: 1000, reward: 15000 },
    { id: 'a30', cat: 'collection', desc: 'Discover 250 Different Players', type: 'discovered', target: 250, reward: 3000 },
    { id: 'a31', cat: 'collection', desc: 'Discover 750 Different Players', type: 'discovered', target: 750, reward: 8000 },
    { id: 'a32', cat: 'collection', desc: 'Discover 1500 Different Players', type: 'discovered', target: 1500, reward: 20000 },
    { id: 'a22', cat: 'collection', desc: 'Own 5 Signature Cards', type: 'sigCards', target: 5, reward: 5000 },
    { id: 'a9', cat: 'collection', desc: 'Own 10 Signature Cards', type: 'sigCards', target: 10, reward: 8000 },
    { id: 'a10', cat: 'collection', desc: 'Own 25 Holographic Cards', type: 'holoCards', target: 25, reward: 6000 },
    { id: 'a23', cat: 'collection', desc: 'Own 50 Holographic Cards', type: 'holoCards', target: 50, reward: 12000 },
    { id: 'a33', cat: 'collection', desc: 'Own a Hall of Legends Card', type: 'holCards', target: 1, reward: 50000 },
    // === Squad ===
    { id: 'a1', cat: 'squad', desc: 'Field a Squad Averaging 80+ Rating', type: 'squadAvg', target: 80, reward: 1500 },
    { id: 'a2', cat: 'squad', desc: 'Field a Squad Averaging 90+ Rating', type: 'squadAvg', target: 90, reward: 3000 },
    { id: 'a3', cat: 'squad', desc: 'Field a Squad Averaging 95+ Rating', type: 'squadAvg', target: 95, reward: 6000 },
    { id: 'a19', cat: 'squad', desc: 'Field a Squad Averaging 98+ Rating', type: 'squadAvg', target: 98, reward: 12000 },
    { id: 'a34', cat: 'squad', desc: 'Field a Squad Averaging 99+ Rating', type: 'squadAvg', target: 99, reward: 25000 },
    { id: 'a35', cat: 'squad', desc: 'Fill All 5 Academy Slots', type: 'academySize', target: 5, reward: 2500 },
    { id: 'a36', cat: 'squad', desc: 'Field an Academy Averaging 90+ Rating', type: 'academyAvg', target: 90, reward: 6000 },
    // === Economy ===
    { id: 'a37', cat: 'economy', desc: 'Hold 50,000 Blue Essence', type: 'be', target: 50000, reward: 5000 },
    { id: 'a38', cat: 'economy', desc: 'Hold 250,000 Blue Essence', type: 'be', target: 250000, reward: 15000 },
    // === Competitive ===
    { id: 'a7', cat: 'competitive', desc: 'Earn 50 Trophy Points', type: 'trophies', target: 50, reward: 5000 },
    { id: 'a8', cat: 'competitive', desc: 'Earn 200 Trophy Points', type: 'trophies', target: 200, reward: 15000 },
    { id: 'a14', cat: 'competitive', desc: 'Earn 500 Trophy Points', type: 'trophies', target: 500, reward: 20000 },
    { id: 'a15', cat: 'competitive', desc: 'Earn 1000 Trophy Points', type: 'trophies', target: 1000, reward: 50000 },
    { id: 'a24', cat: 'competitive', desc: 'Win 10 Draft Modes', type: 'draftWins', target: 10, reward: 8000 },
    { id: 'a25', cat: 'competitive', desc: 'Win 50 Draft Modes', type: 'draftWins', target: 50, reward: 20000 },
    // === Challenges ===
    { id: 'a39', cat: 'challenges', desc: `Complete All ${CHALLENGES.length} Daily Challenges in One Day`, type: 'rbcToday', target: CHALLENGES.length, reward: 5000 },
    // === Progression ===
    { id: 'a11', cat: 'progression', desc: 'Reach Manager Level 10', type: 'managerLvl', target: 10, reward: 3000 },
    { id: 'a12', cat: 'progression', desc: 'Reach Manager Level 25', type: 'managerLvl', target: 25, reward: 8000 },
    { id: 'a13', cat: 'progression', desc: 'Reach Manager Level 50', type: 'managerLvl', target: 50, reward: 15000 },
    { id: 'a20', cat: 'progression', desc: 'Reach Manager Level 100', type: 'managerLvl', target: 100, reward: 30000 },
    { id: 'a16', cat: 'progression', desc: 'Reach Tower Floor 50', type: 'towerBest', target: 50, reward: 10000 },
    { id: 'a17', cat: 'progression', desc: 'Reach Tower Floor 100', type: 'towerBest', target: 100, reward: 25000 },
    { id: 'a21', cat: 'progression', desc: 'Reach Tower Floor 200', type: 'towerBest', target: 200, reward: 50000 },
    { id: 'a40', cat: 'progression', desc: 'Reach Battle Pass Tier 25', type: 'bpTier', target: 25, reward: 5000 },
    { id: 'a41', cat: 'progression', desc: 'Reach Battle Pass Tier 50', type: 'bpTier', target: 50, reward: 12000 },
    { id: 'a42', cat: 'progression', desc: 'Prestige for the First Time', type: 'prestige', target: 1, reward: 25000 },
];

export const LINEUP_ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];

// Same maths the Squad/Academy tabs display: a full five, averaged on EFFECTIVE
// rating (holo/signature bonuses included). A rating quest must tick on exactly the
// number the player can see, so this must stay in sync with Squad.svelte.
export function lineupAvg(lineup) {
    const starters = LINEUP_ROLES.map(r => lineup[r]).filter(Boolean);
    if (starters.length < LINEUP_ROLES.length) return 0;
    return Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length);
}
