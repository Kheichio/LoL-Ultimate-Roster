import { writable, derived, get } from 'svelte/store';
import { loadFromStorage, saveToStorage } from '../utils/storage.js';
import { getDB, getCardById } from '../utils/cards.js';
import { validateCard, clampNum, signSave, verifySave, BOUNDS } from '../utils/anticheat.js';

// === Core Game State ===
export const blueEssence = writable(1000);
export const club = writable([]);
export const squad = writable({ COACH: null, TOP: null, JNG: null, MID: null, ADC: null, SUP: null });
export const bench = writable([null, null, null]);
export const hasBoughtStarter = writable(false);
export const teamIdentity = writable({ name: 'My Team', logo: '🛡️', color: '#3b82f6', favouriteTeam: '', favouritePlayer: '', unlockedIcons: [], unlockedColors: [] });
export const showcasePicks = writable([]);

// === Progression ===
export const managerXP = writable(0);
export const managerLevel = writable(1);
export const skillPoints = writable(0);
export const skills = writable({ scouting: 0, tactics: 0, transfer: 0, conditioning: 0, stamina: 0, mentorship: 0, trading: 0, bench: 0, wealth: 0, clubhouse: 0 });

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

// === Prestige ===
export const prestige = writable(0);

// === Milestone Cards ===
export const milestoneCards = writable([]);

// === Academy (auto-farming secondary team) ===
// 5 role slots (separate from the main squad) + sentAt epoch (0 = idle, >0 = farming since that time).
export const academy = writable({ TOP: null, JNG: null, MID: null, ADC: null, SUP: null, sentAt: 0 });

// === Match History (recent results log, newest first, capped at 50) ===
export const matchHistory = writable([]);
export function logMatch(entry) {
    const e = { mode: 'match', result: 'loss', opponent: '', be: 0, xp: 0, ts: Date.now(), ...entry };
    matchHistory.update(list => [e, ...list].slice(0, 50));
}

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
    // Returns { total, bonus } — bonus > 0 when Wealth Management is levelled
    return { total, bonus };
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

// === Prestige ===
export function prestigeManager() {
    const lvl = get(managerLevel);
    if (lvl < 100) return false;
    const p = get(prestige) + 1;
    prestige.set(p);
    managerLevel.set(1);
    managerXP.set(0);
    skillPoints.set(0);
    skills.set({ scouting: 0, tactics: 0, transfer: 0, conditioning: 0, stamina: 0, mentorship: 0, trading: 0, bench: 0, wealth: 0, clubhouse: 0 });
    return true;
}

// === Milestone Cards ===
const MILESTONE_DEFS = [
    { id: 'first_worlds', check: ts => (ts.worldsWon || 0) >= 1, name: 'World Champion', role: 'TOP', rating: 99, quality: 'MILESTONE' },
    { id: 'first_msi', check: ts => (ts.msiWon || 0) >= 1, name: 'MSI Champion', role: 'MID', rating: 97, quality: 'MILESTONE' },
    { id: 'tower_100', check: ts => (ts.towerHighestFloor || 0) >= 100, name: 'Tower Climber', role: 'JNG', rating: 95, quality: 'MILESTONE' },
    { id: 'packs_100', check: ts => (ts.packs || 0) >= 100, name: 'Pack Addict', role: 'ADC', rating: 90, quality: 'MILESTONE' },
    { id: 'golden_road', check: ts => (ts.goldenRoads || 0) >= 1, name: 'Golden Road', role: 'SUP', rating: 99, quality: 'MILESTONE' },
    { id: 'prestige_1', check: (ts, p) => p >= 1, name: 'Prestige I', role: 'COACH', rating: 99, quality: 'MILESTONE' },
    { id: 'splits_10', check: ts => (ts.splitsCompleted || 0) >= 10, name: 'Season Veteran', role: 'MID', rating: 94, quality: 'MILESTONE' },
];

export function checkMilestoneCards() {
    const ts = get(trackStats);
    const p = get(prestige);
    const existing = get(milestoneCards);
    const existingIds = new Set(existing.map(c => c.milestoneId));
    const newCards = [];
    for (const def of MILESTONE_DEFS) {
        if (!existingIds.has(def.id) && def.check(ts, p)) {
            newCards.push({ ...def, id: def.id + '_card', milestoneId: def.id, uniqueId: 'milestone_' + def.id, team: 'Milestone', year: new Date().getFullYear(), region: 'Legacy', locked: true, stats: { mec: def.rating - 2, tmf: def.rating - 1, frm: def.rating, cmp: def.rating, map: def.rating - 1, ldr: def.rating + 1 } });
        }
    }
    if (newCards.length > 0) {
        milestoneCards.update(m => [...m, ...newCards]);
        return newCards;
    }
    return [];
}

// === Team Name Generator ===
const _ADJ  = ['Apex','Azure','Blazing','Crimson','Crystal','Dark','Frozen','Ghost','Golden','Iron','Jade','Neon','Nova','Obsidian','Phantom','Prime','Scarlet','Shadow','Silver','Solar','Storm','Thunder','Toxic','Void'];
const _NOUN = ['Bears','Cobras','Dragons','Eagles','Falcons','Foxes','Hawks','Hydras','Jaguars','Knights','Lions','Panthers','Phoenix','Ravens','Serpents','Sharks','Tigers','Titans','Vipers','Wolves'];
const _LOGO = ['🐉','🦁','🐺','🦅','🐯','🦊','🦈','🐍','🦉','🦇','⚡','🔥','💎','🌊','🌪️','🗡️','🎯','👑','🔮','🏹'];
const _COLOR = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#14b8a6','#a855f7'];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateTeamIdentity() {
    return {
        name: `${_pick(_ADJ)} ${_pick(_NOUN)}`,
        logo: _pick(_LOGO),
        color: _pick(_COLOR),
        favouriteTeam: '',
        favouritePlayer: '',
        unlockedIcons: [],
        unlockedColors: [],
    };
}

// === Save / Load ===
let _saveDebounce = null;

// Single source of truth: every persisted store → its storage key. Shared by local
// save (saveGame), cloud save, and cloud load so the three can never drift apart.
export function snapshotState() {
    return {
        lur_be: get(blueEssence),
        lur_club: get(club),
        lur_squad: get(squad),
        lur_bench: get(bench),
        lur_starter: get(hasBoughtStarter),
        lur_showcase: get(showcasePicks),
        lur_identity: get(teamIdentity),
        lur_stats: get(trackStats),
        lur_progression: { xp: get(managerXP), level: get(managerLevel), sp: get(skillPoints), skills: get(skills) },
        lur_collection: get(collectionRegistry),
        lur_unlocks: get(unlocks),
        lur_season: get(seasonData),
        lur_battlepass: get(battlePass),
        lur_dailylogin: get(dailyLogin),
        lur_quests_claimed: get(questsClaimed),
        lur_quests_rbase: get(questsRepeatableBaselines),
        lur_quests_rcounts: get(questsRepeatableCounts),
        lur_achievements_claimed: get(achievementsClaimed),
        lur_archive_rewards: get(archiveRewards),
        lur_prestige: get(prestige),
        lur_milestone_cards: get(milestoneCards),
        lur_academy: get(academy),
        lur_matchhistory: get(matchHistory),
    };
}

export function saveGame() {
    if (_saveDebounce) clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(() => {
        const state = snapshotState();
        for (const [k, v] of Object.entries(state)) saveToStorage(k, v);
        // Integrity signature — written last so it covers all values above
        saveToStorage('lur_s', signSave(get(blueEssence), get(managerLevel), get(prestige), get(club).length));
    }, 100);
}

// Write a full snapshot (key → value) into localStorage, then re-hydrate every store
// via initGame() so cloud loads get the exact same validation/clamping as local loads.
export function applyState(state) {
    if (!state || typeof state !== 'object') return;
    for (const [k, v] of Object.entries(state)) {
        if (v !== undefined) saveToStorage(k, v);
    }
    initGame();
    saveGame();
}

export function initGame() {
    const dbLoaded = !!getDB();

    // Helpers
    const sanitiseCards = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map(c => validateCard(c, getCardById, dbLoaded)).filter(Boolean);
    };
    const sanitiseSquad = (obj) => {
        const blank = { COACH: null, TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
        if (!obj || typeof obj !== 'object') return blank;
        const result = { ...blank };
        for (const role of Object.keys(blank)) {
            if (obj[role]) result[role] = validateCard(obj[role], getCardById, dbLoaded) || null;
        }
        return result;
    };

    // Read raw values that the integrity hash covers
    const rawBE   = loadFromStorage('lur_be');
    const rawProg = loadFromStorage('lur_progression');
    const rawPt   = loadFromStorage('lur_prestige');
    const rawClub = loadFromStorage('lur_club');

    // Integrity check — only runs if a signature was previously saved
    const savedSig = loadFromStorage('lur_s');
    if (savedSig) {
        const checkBE      = Math.floor(Number(rawBE) || 0);
        const checkLevel   = rawProg ? Math.floor(Number(rawProg.level) || 1) : 1;
        const checkPrestige= Math.floor(Number(rawPt) || 0);
        const checkLen     = Array.isArray(rawClub) ? rawClub.length : 0;
        if (!verifySave(savedSig, checkBE, checkLevel, checkPrestige, checkLen)) {
            console.warn('[LUR] Save integrity mismatch — values will be clamped.');
        }
    }

    // Blue Essence — hard cap prevents economic exploits
    if (rawBE !== null) blueEssence.set(clampNum(rawBE, BOUNDS.be.min, BOUNDS.be.max, 1000));

    // Club / squad / bench — strip any card not in the database
    if (rawClub) club.set(sanitiseCards(rawClub));

    const rawSquad = loadFromStorage('lur_squad');
    if (rawSquad) squad.set(sanitiseSquad(rawSquad));

    const rawBench = loadFromStorage('lur_bench');
    if (rawBench && Array.isArray(rawBench)) {
        bench.set(rawBench.map(c => c ? (validateCard(c, getCardById, dbLoaded) || null) : null));
    }

    const sc = loadFromStorage('lur_showcase');
    if (sc) showcasePicks.set(sanitiseCards(sc));

    const st = loadFromStorage('lur_starter');
    if (st !== null) hasBoughtStarter.set(st === true || st === 'true');

    const id = loadFromStorage('lur_identity');
    if (!id) {
        // Brand-new save — give them a unique generated identity
        teamIdentity.set(generateTeamIdentity());
    } else if (id.name === 'My Team' && id.logo === '🛡️') {
        // Never customised — generate a unique name but keep any colour they may have changed
        const gen = generateTeamIdentity();
        teamIdentity.set({ ...gen, color: id.color !== '#3b82f6' ? id.color : gen.color, favouriteTeam: id.favouriteTeam || '', favouritePlayer: id.favouritePlayer || '', unlockedIcons: id.unlockedIcons || [], unlockedColors: id.unlockedColors || [] });
    } else {
        teamIdentity.set({ unlockedIcons: [], unlockedColors: [], ...id });
    }

    const ts = loadFromStorage('lur_stats');
    if (ts) trackStats.set({ ...get(trackStats), ...ts });

    // Progression — clamp numeric fields so level/XP can't be inflated
    if (rawProg) {
        managerXP.set(clampNum(rawProg.xp, BOUNDS.xp.min, BOUNDS.xp.max, 0));
        managerLevel.set(clampNum(rawProg.level, BOUNDS.level.min, BOUNDS.level.max, 1));
        skillPoints.set(clampNum(rawProg.sp, BOUNDS.sp.min, BOUNDS.sp.max, 0));
        if (rawProg.skills) {
            const clamped = {};
            for (const [k, v] of Object.entries({ ...get(skills), ...rawProg.skills })) {
                clamped[k] = clampNum(v, BOUNDS.skill.min, BOUNDS.skill.max, 0);
            }
            skills.set(clamped);
        }
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

    if (rawPt !== null) prestige.set(clampNum(rawPt, BOUNDS.prestige.min, BOUNDS.prestige.max, 0));

    // Milestone cards — reconstruct from definitions so stats can't be boosted
    const rawMC = loadFromStorage('lur_milestone_cards');
    if (rawMC && Array.isArray(rawMC)) {
        const valid = rawMC.filter(card => card && card.milestoneId && MILESTONE_DEFS.some(d => d.id === card.milestoneId))
            .map(card => {
                const def = MILESTONE_DEFS.find(d => d.id === card.milestoneId);
                return { ...def, id: def.id + '_card', milestoneId: def.id, uniqueId: 'milestone_' + def.id,
                    team: 'Milestone', year: new Date().getFullYear(), region: 'Legacy', locked: true,
                    stats: { mec: def.rating - 2, tmf: def.rating - 1, frm: def.rating, cmp: def.rating, map: def.rating - 1, ldr: def.rating + 1 } };
            });
        milestoneCards.set(valid);
    }

    // Academy — validate the 5 assigned cards against the DB; keep the farming timestamp
    const rawAcademy = loadFromStorage('lur_academy');
    if (rawAcademy && typeof rawAcademy === 'object') {
        const result = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null, sentAt: 0 };
        for (const role of ['TOP', 'JNG', 'MID', 'ADC', 'SUP']) {
            if (rawAcademy[role]) result[role] = validateCard(rawAcademy[role], getCardById, dbLoaded) || null;
        }
        result.sentAt = Math.max(0, Math.floor(Number(rawAcademy.sentAt) || 0));
        academy.set(result);
    }

    const rawMH = loadFromStorage('lur_matchhistory');
    if (rawMH && Array.isArray(rawMH)) matchHistory.set(rawMH.slice(0, 50));
}
