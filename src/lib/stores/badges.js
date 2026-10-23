import { derived, readable } from 'svelte/store';
import {
    blueEssence, skillPoints, dailyLogin, battlePass, collectionRegistry, archiveRewards, trackStats,
    club, squad, weightedTrophies, managerLevel, questsClaimed, questsRepeatableBaselines,
    achievementsClaimed, prestige, academy, rbcState, hasBoughtStarter,
} from './game.js';
import { friendRequestCount } from './friends.js';
import { todayKey, claimedToday, rbcBadge } from '../utils/rbc.js';
import { milestoneQuests, repeatableQuests, achievements, LINEUP_ROLES, lineupAvg } from '../utils/quests.js';
import { claimableCount as bpClaimable } from '../utils/battlepass.js';
import { HALL_OF_LEGENDS } from '../utils/cards.js';

// Everything in the roster shell that can be waiting for the player, counted once. The nav
// badges (Header) and the Home page's To-do list both read this, so "3 quests ready" can
// never mean one thing in the bar and another on the page.

// Time moves the academy timer, the daily login and the RBC day; 15s is plenty for all three.
const clock = readable(Date.now(), set => {
    const t = setInterval(() => set(Date.now()), 15000);
    return () => clearInterval(t);
});

function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    const a = new Date(d1), b = new Date(d2);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const UPGRADE_PATHS = [
    { from: 'Bronze', count: 10, cost: 50 }, { from: 'Silver', count: 10, cost: 100 },
    { from: 'Gold', count: 10, cost: 200 }, { from: 'Platinum', count: 8, cost: 400 },
    { from: 'Diamond', count: 8, cost: 800 }, { from: 'Master', count: 5, cost: 1500 },
];

export const badges = derived(
    [clock, blueEssence, skillPoints, dailyLogin, battlePass, collectionRegistry, archiveRewards, trackStats,
     club, squad, weightedTrophies, managerLevel, questsClaimed, questsRepeatableBaselines,
     achievementsClaimed, prestige, academy, rbcState, friendRequestCount, hasBoughtStarter],
    ([$now, $be, $sp, $daily, $bp, $reg, $archive, $ts, $club, $squad, $trophies, $level, $qc, $rb,
      $ac, $prestige, $academy, $rbc, $friends, $starter]) => {
        const daily = isSameDay($daily.lastClaim, $now) ? 0 : 1;
        const bp = bpClaimable($bp);

        let collection = 0;
        const claimedCards = ($archive && $archive.claimedCards) || {};
        for (const id in $reg) if ($reg[id] && !claimedCards[id]) collection++;

        // Quests — same maths the Quests tab claims with.
        let quests = 0;
        for (const q of milestoneQuests) if (!$qc[q.id] && ($ts[q.stat] || 0) >= q.target) quests++;
        for (const q of repeatableQuests) quests += Math.floor(Math.max(0, ($ts[q.stat] || 0) - ($rb[q.id] || 0)) / q.target);
        const ctx = { squad: $squad, academy: $academy, club: $club, reg: $reg, trophies: $trophies, be: $be, level: $level, prestige: $prestige, bp: $bp, ts: $ts, rbc: $rbc, now: $now };
        for (const a of achievements) if (!$ac[a.id] && achievementProgress(a, ctx) >= a.target) quests++;

        let upgrade = 0;
        const sqIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
        for (const p of UPGRADE_PATHS) {
            if ($be < p.cost) continue;
            for (const r of ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH']) {
                const n = $club.filter(c => c.quality === p.from && c.role === r && !sqIds.has(c.uniqueId) && !c.locked).length;
                if (n >= p.count) upgrade++;
            }
        }

        const starters = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'].filter(r => $squad[r]).length;

        return {
            daily,
            battlePass: bp,
            rewards: daily + bp,
            skills: $sp > 0 ? $sp : 0,
            collection,
            quests,
            upgrade,
            academy: ($academy.sentAt > 0 && $now >= $academy.sentAt + 3600000) ? 1 : 0,
            rbc: rbcBadge($ts, $rbc, todayKey($now)),
            friends: $friends || 0,
            starters,
            starterPack: $starter ? 0 : 1,
        };
    }
);

/** Live progress for an achievement. Shared with the Quests tab so the badge and the claim agree. */
export function achievementProgress(a, c) {
    try {
        if (a.type === 'squadAvg') return lineupAvg(c.squad);
        if (a.type === 'academySize') return LINEUP_ROLES.filter(r => c.academy[r]).length;
        if (a.type === 'academyAvg') return lineupAvg(c.academy);
        if (a.type === 'clubSize') return (c.club || []).length;
        if (a.type === 'discovered') return Object.keys(c.reg || {}).length;
        if (a.type === 'trophies') return c.trophies || 0;
        if (a.type === 'sigCards') return (c.club || []).filter(x => x && x.signature).length;
        if (a.type === 'holoCards') return (c.club || []).filter(x => x && x.holographic).length;
        if (a.type === 'holCards') return (c.club || []).filter(x => x && x.quality === HALL_OF_LEGENDS).length;
        if (a.type === 'be') return c.be || 0;
        if (a.type === 'managerLvl') return c.level || 1;
        if (a.type === 'prestige') return c.prestige || 0;
        if (a.type === 'bpTier') return (c.bp && c.bp.tier) || 0;
        if (a.type === 'towerBest') return c.ts.towerHighestFloor || 0;
        if (a.type === 'draftWins') return c.ts.draftModesWon || 0;
        // Daily RBCs — only today's clears count, so this resets with the challenges.
        if (a.type === 'rbcToday') return Object.keys(claimedToday(c.rbc, todayKey(c.now || Date.now()))).length;
    } catch (e) { return 0; }
    return 0;
}
