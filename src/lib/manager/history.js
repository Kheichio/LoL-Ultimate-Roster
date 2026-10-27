// ===========================================================================
//  ULTIMATE MANAGER -- club history and legends
//
//  Two sources, merged per player:
//    BEFORE THE SAVE  the card database. A real org's standard cards say who
//                     played for it in which years; its special prints say what
//                     it won and with whom (Champion = Worlds, MSI, FirstStand,
//                     Finalist = a Worlds final lost). Special prints carry the
//                     region "Legacy", so they are matched by org tag and then
//                     confirmed against the players' own cards in the region.
//                     Read-only, memoised.
//    DURING THE SAVE  `team.hist`, kept only for clubs the manager runs
//                     (trackClub), written by the engine on every series, title
//                     and award. Names are stored with ids: a player can retire
//                     and the record must still read.
// ===========================================================================
import { sameOrg } from './data.js';
import { personsIndex } from './world.js';

// ---------------------------------------------------------------- in the save
function histEntry(team, p, year) {
    let e = team.hist[p.id];
    if (!e) e = team.hist[p.id] = { n: p.name, r: p.role, real: !!p.real, y0: year, y1: year, s: 0, ly: 0, g: 0, w: 0, mvp: 0, t: {}, aw: [] };
    e.n = p.name;
    e.r = p.role;
    if (year > e.y1) e.y1 = year;
    if (year < e.y0) e.y0 = year;
    return e;
}

/** Start keeping a club's history (the manager has just taken it over). */
export function trackClub(save, team) {
    if (!team) return;
    if (!team.hist || typeof team.hist !== 'object') { team.hist = {}; team.histFrom = save.time.year; }
    for (const id of team.roster) { const p = save.players[id]; if (p) histEntry(team, p, save.time.year); }
}

/** One game played for a tracked club. A season counts once a player plays in it. */
export function histGame(team, p, year, won, mvp) {
    if (!team || !team.hist || !p) return;
    const e = histEntry(team, p, year);
    if (e.ly !== year) { e.ly = year; e.s++; }
    e.g++;
    if (won) e.w++;
    if (mvp) e.mvp++;
}

/**
 * A title: credited to everyone on the roster who played for the club this
 * year, plus the current five. A sub who never got a game has no medal.
 * `kind` is league, tier2, msi or worlds.
 */
export function histTitle(save, team, kind) {
    if (!team || !team.hist) return;
    const year = save.time.year;
    const five = new Set(Object.values(team.lineup || {}));
    for (const id of team.roster) {
        const p = save.players[id];
        if (!p) continue;
        const had = team.hist[p.id];
        if (!five.has(id) && !(had && had.ly === year)) continue;
        const e = histEntry(team, p, year);
        e.t[kind] = (e.t[kind] || 0) + 1;
    }
}

export function histAward(team, p, label, year) {
    if (!team || !team.hist || !p) return;
    const e = histEntry(team, p, year);
    e.aw = [...(e.aw || []), label].slice(-12);
}

/** The year is over: everyone still on the roster was here this year. */
export function histYearEnd(save, team) {
    if (!team || !team.hist) return;
    for (const id of team.roster) { const p = save.players[id]; if (p) histEntry(team, p, save.time.year); }
}

// ---------------------------------------------------------------- before the save
const PRINT_KIND = { Champion: 'worlds', MSI: 'msi', FirstStand: 'firststand', Finalist: 'worldsfinal' };
const _real = new Map();

/**
 * What the card database knows about a real org before `beforeYear`: every
 * player who held a standard card for it (seasons, years, best rating) and its
 * titles. { players: [...], honours: [{ kind, year }] }.
 */
export function realHistory(db, team, beforeYear) {
    const empty = { players: [], honours: [] };
    if (!db || !team || team.custom || !team.real) return empty;
    const key = team.id + ':' + beforeYear;
    if (_real.has(key)) return _real.get(key);
    const idx = personsIndex(db);
    const byName = new Map();
    for (const person of idx.persons.values()) {
        const cards = person.cards.filter(c => c.year < beforeYear && c.region === team.region && sameOrg(team.region, team.short, c.team));
        if (!cards.length) continue;
        const years = [...new Set(cards.map(c => c.year))].sort((a, b) => a - b);
        const roles = {};
        for (const c of cards) roles[c.role] = (roles[c.role] || 0) + 1;
        const e = {
            id: person.key, n: person.name, r: Object.entries(roles).sort((a, b) => b[1] - a[1])[0][0], real: true,
            y0: years[0], y1: years[years.length - 1], s: years.length, g: 0, w: 0, mvp: 0, t: {}, aw: [],
            best: Math.max(...cards.map(c => c.rating)), pre: true,
        };
        byName.set(String(person.name).toLowerCase(), e);
        for (const c of cards) byName.set(String(c.name).toLowerCase(), e);
    }
    const players = [...new Set(byName.values())];
    // Titles from the special prints, kept only when one of the names on the print
    // really played for this org: a tag alone can belong to two regions.
    const won = new Map();
    for (const c of db) {
        const kind = PRINT_KIND[c.quality];
        if (!kind || c.year >= beforeYear || !sameOrg(team.region, team.short, c.team)) continue;
        const k = kind + ':' + c.year;
        if (!won.has(k)) won.set(k, new Set());
        won.get(k).add(String(c.name).toLowerCase());
    }
    const honours = [];
    for (const [k, names] of won) {
        const [kind, y] = k.split(':');
        const credited = [...names].map(n => byName.get(n)).filter(Boolean);
        if (!credited.length) continue;
        honours.push({ kind, year: Number(y) });
        if (kind === 'worldsfinal') continue;
        for (const e of new Set(credited)) e.t[kind] = (e.t[kind] || 0) + 1;
    }
    honours.sort((a, b) => a.year - b.year);
    const out = { players, honours };
    if (_real.size > 60) _real.clear();
    _real.set(key, out);
    return out;
}

// ---------------------------------------------------------------- reading it
/** How much a player means to a club. */
export function legendScore(e) {
    const t = e.t || {};
    return (e.s || 0) * 12 + (e.g || 0) * 0.12 + (t.worlds || 0) * 45 + (t.msi || 0) * 25 + (t.league || 0) * 18
        + (t.firststand || 0) * 15 + (t.tier2 || 0) * 6 + (e.aw || []).length * 12 + (e.mvp || 0) * 0.4;
}
export function legendTier(score) {
    if (score >= 120) return { name: 'Club legend', color: '#facc15' };
    if (score >= 70) return { name: 'Club great', color: '#c4b5fd' };
    if (score >= 40) return { name: 'Servant', color: '#6ee7b7' };
    return null;
}
export const titleCount = (e) => Object.entries(e.t || {}).reduce((s, [k, n]) => s + (k === 'worldsfinal' ? 0 : n), 0);

/** Titles the club won in this save: league and second-tier splits, MSI, Worlds. */
export function saveHonours(save, team) {
    const out = [];
    const add = (year, kind, name) => out.push({ year, kind, name });
    for (const h of save.history || []) {
        for (const [key, id] of Object.entries(h.champs || {})) {
            if (id !== team.id) continue;
            const [, tier, split] = key.split(':');
            add(h.year, tier === '1' ? 'league' : 'tier2', split === 'spring' ? 'Spring' : 'Summer');
        }
        if (h.msi === team.id) add(h.year, 'msi', 'MSI');
        if (h.worlds === team.id) add(h.year, 'worlds', 'Worlds');
    }
    // This year, before it is written to history.
    const S = save.season;
    if (S && !(save.history || []).some(h => h.year === S.year)) {
        for (const [key, b] of Object.entries(S.playoffs || {})) {
            if (b.champion !== team.id) continue;
            const [, tier, split] = key.split(':');
            add(S.year, tier === '1' ? 'league' : 'tier2', split === 'spring' ? 'Spring' : 'Summer');
        }
        if (S.msi && S.msi.champion === team.id) add(S.year, 'msi', 'MSI');
        if (S.worlds && S.worlds.champion === team.id) add(S.year, 'worlds', 'Worlds');
    }
    for (const tr of (save.manager.trophies || [])) if (tr.kind === 'promotion' && tr.teamId === team.id) add(tr.year, 'promotion', 'Promotion');
    return out.sort((a, b) => a.year - b.year);
}

/**
 * The whole story of a club: every player who ever played for it (the card
 * database before the save, `team.hist` during it, merged per player), ranked,
 * and every honour.
 */
export function clubHistory(save, db, team) {
    const before = save.time.startYear;
    const real = realHistory(db, team, before);
    const merged = new Map();
    for (const e of real.players) merged.set(e.id, { ...e, t: { ...e.t }, aw: [...e.aw] });
    for (const [id, h] of Object.entries(team.hist || {})) {
        const cur = merged.get(id);
        if (cur) {
            cur.s += h.s; cur.g += h.g; cur.w += h.w; cur.mvp += h.mvp || 0;
            cur.y0 = Math.min(cur.y0, h.y0); cur.y1 = Math.max(cur.y1, h.y1);
            for (const [k, n] of Object.entries(h.t || {})) cur.t[k] = (cur.t[k] || 0) + n;
            cur.aw = [...cur.aw, ...(h.aw || [])];
            cur.inSave = true;
        } else {
            merged.set(id, { id, ...h, t: { ...(h.t || {}) }, aw: [...(h.aw || [])], inSave: true, pre: false });
        }
    }
    const roster = new Set(team.roster);
    const players = [...merged.values()].map(e => {
        const score = legendScore(e);
        return { ...e, current: roster.has(e.id), score, tier: legendTier(score), titles: titleCount(e) };
    }).sort((a, b) => b.score - a.score || b.y1 - a.y1);
    const honours = [...real.honours.map(h => ({ ...h, pre: true })), ...saveHonours(save, team)];
    return { players, honours, tracked: !!team.hist, trackedFrom: team.histFrom || null, before };
}
