import { writable, derived, get } from 'svelte/store';
import { loadFromStorage, saveToStorage } from '../utils/storage.js';

// === Core Game State ===
export const blueEssence = writable(1000);
export const club = writable([]);
export const squad = writable({ COACH: null, TOP: null, JNG: null, MID: null, ADC: null, SUP: null });
export const bench = writable([null, null, null]);
export const hasBoughtStarter = writable(false);
export const teamIdentity = writable({ name: 'My Team', logo: '🛡️', color: '#3b82f6', favouriteTeam: '', favouritePlayer: '' });
export const showcasePicks = writable([]);

// === Progression ===
export const managerXP = writable(0);
export const managerLevel = writable(1);
export const skillPoints = writable(0);
export const skills = writable({ scouting: 0, tactics: 0, transfer: 0, conditioning: 0, mentorship: 0, bootcamp: 0 });

// === Tracking ===
export const trackStats = writable({
    packs: 0, tournamentsWon: 0, goldenRoads: 0, soldCount: 0, soldBE: 0, matchesPlayed: {},
    cafeWins: 0, regionalSplitWon: 0, firstStandWon: 0, msiWon: 0, worldsWon: 0,
    losses: 0, draftModesPlayed: 0, draftModesWon: 0, upgradesPerformed: 0,
    splitsCompleted: 0, holographicPulled: 0, signaturesPulled: 0,
});

// === Systems ===
export const collectionRegistry = writable({});
export const unlocks = writable({ firstStand: false, msi: false, worlds: false, draftMode: false, salaryCap: false, tower: false });
export const seasonData = writable({ currentSplit: 1, splitWins: 0, splitLosses: 0, trophyCase: [], opponents: [], matchResults: [] });
export const battlePass = writable({ season: 1, tier: 0, xp: 0, claimed: [] });

// === Daily Login ===
export const dailyLogin = writable({ lastClaim: null, streak: 0, totalDays: 0 });

// === Quests ===
export const questsClaimed = writable({});
export const questsRepeatableBaselines = writable({});
export const questsRepeatableCounts = writable({});
export const achievementsClaimed = writable({});

// === Archive Rewards ===
export const archiveRewards = writable({ claimedCards: {}, claimedTeams: {} });

// === Derived ===
export const clubCapacity = derived(skills, $s => 100 + ($s.clubhouse || 0) * 50);
export const isClubFull = derived([club, clubCapacity], ([$c, $cap]) => $c.length >= $cap);
export const weightedTrophies = derived(trackStats, $ts =>
    (($ts.worldsWon || 0) * 6) + (($ts.msiWon || 0) * 4) + (($ts.firstStandWon || 0) * 2) +
    (($ts.regionalSplitWon || 0) * 1) + (($ts.goldenRoads || 0) * 10)
);

// === XP System ===
export function grantXP(amount) {
    const mentorLevel = get(skills).mentorship || 0;
    const bonus = Math.round(amount * mentorLevel * 0.1);
    const total = amount + bonus;
    managerXP.update(xp => {
        let newXP = xp + total;
        let lvl = get(managerLevel);
        let sp = get(skillPoints);
        let leveled = false;
        while (newXP >= lvl * 500) {
            newXP -= lvl * 500;
            lvl++;
            sp++;
            leveled = true;
        }
        if (leveled) {
            managerLevel.set(lvl);
            skillPoints.set(sp);
        }
        return newXP;
    });
}

// === Wealth Bonus BE ===
export function grantBE(amount) {
    const wealthLevel = get(skills).wealth || 0;
    const bonus = Math.round(amount * wealthLevel * 0.1);
    const total = amount + bonus;
    blueEssence.update(v => v + total);
    return total;
}

// === Battle Pass XP ===
export function grantBPXP(amount) {
    battlePass.update(bp => {
        let xp = (bp.xp || 0) + amount;
        let tier = bp.tier || 0;
        const XP_PER_TIER = 1000;
        while (xp >= XP_PER_TIER) {
            xp -= XP_PER_TIER;
            tier++;
        }
        return { ...bp, xp, tier };
    });
}

// === Save / Load ===
let _saveDebounce = null;

export function saveGame() {
    if (_saveDebounce) clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(() => {
        saveToStorage('lur_be', get(blueEssence));
        saveToStorage('lur_club', get(club));
        saveToStorage('lur_squad', get(squad));
        saveToStorage('lur_bench', get(bench));
        saveToStorage('lur_starter', get(hasBoughtStarter));
        saveToStorage('lur_showcase', get(showcasePicks));
        saveToStorage('lur_identity', get(teamIdentity));
        saveToStorage('lur_stats', get(trackStats));
        saveToStorage('lur_progression', { xp: get(managerXP), level: get(managerLevel), sp: get(skillPoints), skills: get(skills) });
        saveToStorage('lur_collection', get(collectionRegistry));
        saveToStorage('lur_unlocks', get(unlocks));
        saveToStorage('lur_season', get(seasonData));
        saveToStorage('lur_battlepass', get(battlePass));
        saveToStorage('lur_dailylogin', get(dailyLogin));
        saveToStorage('lur_quests_claimed', get(questsClaimed));
        saveToStorage('lur_quests_rbase', get(questsRepeatableBaselines));
        saveToStorage('lur_quests_rcounts', get(questsRepeatableCounts));
        saveToStorage('lur_achievements_claimed', get(achievementsClaimed));
        saveToStorage('lur_archive_rewards', get(archiveRewards));
    }, 100);
}

export function initGame() {
    const be = loadFromStorage('lur_be');
    if (be !== null) blueEssence.set(Number(be));

    const c = loadFromStorage('lur_club');
    if (c) club.set(c);

    const s = loadFromStorage('lur_squad');
    if (s) squad.set(s);

    const bn = loadFromStorage('lur_bench');
    if (bn) bench.set(bn);

    const sc = loadFromStorage('lur_showcase');
    if (sc) showcasePicks.set(sc);

    const st = loadFromStorage('lur_starter');
    if (st !== null) hasBoughtStarter.set(st === true || st === 'true');

    const id = loadFromStorage('lur_identity');
    if (id) teamIdentity.set(id);

    const ts = loadFromStorage('lur_stats');
    if (ts) trackStats.set({ ...get(trackStats), ...ts });

    const prog = loadFromStorage('lur_progression');
    if (prog) {
        managerXP.set(prog.xp || 0);
        managerLevel.set(prog.level || 1);
        skillPoints.set(prog.sp || 0);
        skills.set({ ...get(skills), ...prog.skills });
    }

    const col = loadFromStorage('lur_collection');
    if (col) collectionRegistry.set(col);

    const u = loadFromStorage('lur_unlocks');
    if (u) unlocks.set({ ...get(unlocks), ...u });

    const sd = loadFromStorage('lur_season');
    if (sd) seasonData.set({ ...get(seasonData), ...sd });

    const bp = loadFromStorage('lur_battlepass');
    if (bp) battlePass.set({ ...get(battlePass), ...bp });

    const dl = loadFromStorage('lur_dailylogin');
    if (dl) dailyLogin.set({ ...get(dailyLogin), ...dl });

    const qc = loadFromStorage('lur_quests_claimed');
    if (qc) questsClaimed.set(qc);

    const qrb = loadFromStorage('lur_quests_rbase');
    if (qrb) questsRepeatableBaselines.set(qrb);

    const qrc = loadFromStorage('lur_quests_rcounts');
    if (qrc) questsRepeatableCounts.set(qrc);

    const ac = loadFromStorage('lur_achievements_claimed');
    if (ac) achievementsClaimed.set(ac);

    const ar = loadFromStorage('lur_archive_rewards');
    if (ar) archiveRewards.set({ ...get(archiveRewards), ...ar });
}
