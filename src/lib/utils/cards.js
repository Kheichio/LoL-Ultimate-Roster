const SPECIAL_QUALITIES = new Set(['Champion', 'MVP', 'Finalist', 'MSI', 'FirstStand', 'Signature', 'POTY', 'ROTY', 'TOTY', 'GPOTY', 'X']);

export const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Challenger'];
export const LEGACY_TIERS = ['Champion', 'MVP', 'Finalist', 'MSI', 'FirstStand'];
export const AWARD_TIERS = ['POTY', 'ROTY', 'TOTY', 'GPOTY', 'X'];
export const ALL_SPECIAL = [...LEGACY_TIERS, ...AWARD_TIERS];

export function ratingToQuality(rating) {
    if (rating >= 98) return 'Challenger';
    if (rating >= 96) return 'Grandmaster';
    if (rating >= 94) return 'Master';
    if (rating >= 90) return 'Diamond';
    if (rating >= 85) return 'Platinum';
    if (rating >= 80) return 'Gold';
    if (rating >= 70) return 'Silver';
    return 'Bronze';
}

let _dbCache = null;
let _dbMap = null;

export function getDB() {
    if (_dbCache) return _dbCache;
    const raw = window.playerDatabase;
    if (!raw) return null;
    _dbCache = raw.map(c => SPECIAL_QUALITIES.has(c.quality) ? c : { ...c, quality: ratingToQuality(c.rating) });
    _dbMap = new Map();
    _dbCache.forEach(c => _dbMap.set(c.id, c));
    return _dbCache;
}

export function getCardById(id) {
    if (!_dbMap) getDB();
    return _dbMap ? _dbMap.get(id) : null;
}

export function getSellValue(quality, card = null) {
    const vals = { Bronze: 2, Silver: 5, Gold: 15, Platinum: 30, Diamond: 50, Master: 90, Grandmaster: 150, MVP: 175, Challenger: 300, Champion: 250, Finalist: 200, MSI: 220, FirstStand: 180, Coach: 20 };
    let base = vals[quality] || 2;
    if (card && card.holographic) base = Math.floor(base * 1.5);
    return base;
}

export function isDarkCard(quality, role) {
    const dark = ['Challenger', 'Champion', 'MVP', 'Finalist', 'MSI', 'FirstStand', 'Diamond', 'POTY', 'ROTY', 'TOTY', 'GPOTY', 'X'];
    return dark.includes(quality) || role === 'COACH';
}

export function isMidCard(quality) {
    return ['Master', 'Grandmaster'].includes(quality);
}

export function makeUniqueId(prefix = '') {
    return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function rollPackTier(packType) {
    const rng = Math.random() * 100;
    if (packType === 'standard') {
        if (rng > 85) return 'Gold';
        if (rng > 50) return 'Silver';
        return 'Bronze';
    }
    if (packType === 'premium') {
        if (rng > 97) return 'Diamond';
        if (rng > 85) return 'Platinum';
        if (rng > 55) return 'Gold';
        if (rng > 25) return 'Silver';
        return 'Bronze';
    }
    if (packType === 'elite') {
        if (rng > 95) return 'Master';
        if (rng > 75) return 'Diamond';
        if (rng > 45) return 'Platinum';
        if (rng > 20) return 'Gold';
        return 'Silver';
    }
    if (packType === 'starter') {
        if (rng > 70) return 'Silver';
        return 'Bronze';
    }
    return 'Bronze';
}
