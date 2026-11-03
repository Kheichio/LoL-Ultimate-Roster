// ===========================================================================
//  ULTIMATE MANAGER -- the public manager board
//
//  One row per save slot at `managerBoard/{uid}__{slot}` (the career board's
//  ownership proof, see firestore.rules ownsCareerSlot / validManagerRow). Every
//  signed-in manager is on it by default; `save.settings.boardHidden` takes the
//  row down. Rows are re-clamped on read, and a colour only reaches a style
//  attribute after passing the hex check.
//
//  Firebase is the compat SDK hung off window by index.html; it is absent under
//  SSR (tools/managerRender) and offline, so every call gates on window.fbDb.
// ===========================================================================
import { writable, get } from 'svelte/store';
import { currentUser } from './auth.js';

export const managerBoardRows = writable([]);
export const managerBoardState = writable({ loading: false, error: '', fetchedAt: 0 });

const db = () => ((typeof window !== 'undefined' && window.fbDb) ? window.fbDb : null);
const uidOf = () => { const u = get(currentUser); return (u && typeof u.uid === 'string') ? u.uid : ''; };
const nameOf = () => { const u = get(currentUser); return (u && u.displayName) ? String(u.displayName) : 'Anonymous'; };
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The ranked number: titles first, then promotions, seasons and level. */
export function managerScore(m) {
    return int((m.worlds || 0) * 1000 + (m.msi || 0) * 450 + (m.leagues || 0) * 250 + (m.promotions || 0) * 80
        + (m.seasons || 0) * 20 + (m.level || 0) * 10 + (m.wins || 0), 0, 1000000);
}

/** What a save publishes. */
export function buildManagerRow(save, slot) {
    const m = save.manager || {};
    const t = m.teamId && save.teams ? save.teams[m.teamId] : null;
    const tro = m.trophies || [];
    const count = (k) => tro.filter(x => x.kind === k).length;
    const row = {
        v: 1, slot: int(slot, 1, 3),
        name: str(m.name || 'Manager', 24), displayName: str(nameOf(), 64),
        team: str(t ? t.name : 'Between jobs', 40), short: str(t ? t.short : '-', 8),
        region: str(t ? t.region : '', 8), color: t && HEX.test(t.color) ? t.color : '#64748b',
        tier: int(t ? t.tier : 0, 0, 2), year: int(save.time && save.time.year, 2000, 2200),
        startYear: int(save.time && save.time.startYear, 2000, 2200), level: int(m.level, 1, 1000),
        worlds: int(count('worlds'), 0, 999), msi: int(count('msi'), 0, 999),
        leagues: int(count('league') + count('tier2'), 0, 999), promotions: int(count('promotion'), 0, 999),
        seasons: int((save.time && save.time.year) - (save.time && save.time.startYear), 0, 999),
        wins: int(m.wins, 0, 100000), losses: int(m.losses, 0, 100000),
        updatedAt: Date.now(),
    };
    row.score = managerScore(row);
    return row;
}

const lastSig = {};
let lastAt = 0;
/** Publish (or, when hidden, remove) this slot's row. Throttled, and skipped when nothing changed. */
export async function publishManager(save, slot) {
    const fdb = db();
    const uid = uidOf();
    if (!fdb || !uid || !save || !save.created) return false;
    const id = uid + '__' + int(slot, 1, 3);
    try {
        if (save.settings && save.settings.boardHidden) {
            if (lastSig[id] === 'hidden') return false;
            await fdb.collection('managerBoard').doc(id).delete();
            lastSig[id] = 'hidden';
            return true;
        }
        const row = buildManagerRow(save, slot);
        const sig = JSON.stringify({ ...row, updatedAt: 0 });
        if (sig === lastSig[id] || Date.now() - lastAt < 30000) return false;
        await fdb.collection('managerBoard').doc(id).set(row);
        lastSig[id] = sig;
        lastAt = Date.now();
        return true;
    } catch (e) {
        return false;
    }
}

/** A remote row, trusted for nothing. */
export function sanitizeManagerRow(id, d) {
    if (!d || typeof d !== 'object') return null;
    const sep = String(id).lastIndexOf('__');
    const uid = sep > 0 ? String(id).slice(0, sep) : String(id);
    const row = {
        id: String(id), uid, slot: int(d.slot, 1, 3),
        name: str(d.name, 24) || 'Manager', displayName: str(d.displayName, 64) || 'Anonymous',
        team: str(d.team, 40) || '-', short: str(d.short, 8) || '-', region: str(d.region, 8),
        color: HEX.test(String(d.color)) ? d.color : '#64748b', tier: int(d.tier, 0, 2),
        year: int(d.year, 2000, 2200), startYear: int(d.startYear, 2000, 2200), level: int(d.level, 1, 1000),
        worlds: int(d.worlds, 0, 999), msi: int(d.msi, 0, 999), leagues: int(d.leagues, 0, 999), promotions: int(d.promotions, 0, 999),
        seasons: int(d.seasons, 0, 999), wins: int(d.wins, 0, 100000), losses: int(d.losses, 0, 100000),
        updatedAt: int(d.updatedAt, 0, 9e15),
    };
    row.score = managerScore(row);
    row.isMe = !!uidOf() && uid === uidOf();
    return row;
}

/** Load the top of the board. `field` is a single-field order, so no index is needed. */
export async function loadManagerBoard(field = 'score', limit = 50) {
    const fdb = db();
    if (!fdb) { managerBoardState.set({ loading: false, error: 'The board needs a connection.', fetchedAt: 0 }); return; }
    managerBoardState.update(s => ({ ...s, loading: true, error: '' }));
    try {
        const snap = await fdb.collection('managerBoard').orderBy(field, 'desc').limit(limit).get();
        const rows = [];
        snap.forEach(doc => { const r = sanitizeManagerRow(doc.id, doc.data()); if (r) rows.push(r); });
        managerBoardRows.set(rows);
        managerBoardState.set({ loading: false, error: '', fetchedAt: Date.now() });
    } catch (e) {
        managerBoardState.set({ loading: false, error: 'Could not load the board. If you use an ad blocker, it may be blocking the game\'s database.', fetchedAt: 0 });
    }
}
