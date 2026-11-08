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
//    EVERY PLAYER     `p.cy`, one row per club per year: [year, club, ovr, games,
//                     wins, kills, deaths, assists, rating sum, mvps], and
//                     `p.car`, his career totals. A club's full player record is
//                     read back out of these rows (clubRecord), so the 150 AI clubs
//                     keep a complete history without carrying a ledger each.
//    EVERY CLUB       `team.sh`, one compact row per split for every club in the
//                     world (recordSplits): tier, final place, the five starters
//                     with their OVR, and what the split won or cost (league,
//                     MSI, Worlds, finals, promotion, relegation). A player's
//                     club career is read back out of these rows (playerCareer),
//                     and a retired player is kept in `save.retired` so his
//                     name and career still read after he leaves the world.
// ===========================================================================
import { sameOrg, ROLE_IDS, SPLIT_CODE } from './data.js';
import { personsIndex } from './world.js';
import { lineupOf } from './match.js';
import { ovrOf, stintRow } from './people.js';

// ---------------------------------------------------------------- every club, every split
/** A split row's starters: 'pid~ovr,pid~ovr,...' in role order. */
function packFive(save, team) {
    const lu = lineupOf(team, save.players);
    return ROLE_IDS.map(r => (lu[r] ? lu[r].id + '~' + ovrOf(lu[r]) : '')).join(',');
}
export function unpackFive(f) {
    return String(f || '').split(',').map((x, i) => {
        if (!x) return { role: ROLE_IDS[i], id: null, ovr: null };
        const k = x.lastIndexOf('~');
        return { role: ROLE_IDS[i], id: x.slice(0, k), ovr: Number(x.slice(k + 1)) || null };
    });
}
function splitRow(team, year, split) {
    const s = SPLIT_CODE[split] || split;
    return (team.sh || []).find(r => r.y === year && r.s === s) || null;
}
/** After a split's playoffs: a row for every club in every league. */
export function recordSplits(save, split) {
    const S = save.season;
    if (!S) return;
    for (const [key, L] of Object.entries(S.leagues)) {
        const b = S.playoffs[key + ':' + split];
        for (const id of L.teams) {
            const t = save.teams[id];
            if (!t) continue;
            if (!Array.isArray(t.sh)) t.sh = [];
            if (splitRow(t, S.year, split)) continue;
            const w = [];
            if (b && b.champion === id) w.push(L.tier === 1 ? 'league' : 'tier2');
            else if (b && b.runnerUp === id) w.push(L.tier === 1 ? 'final' : 'final2');
            t.sh.push({ y: S.year, s: SPLIT_CODE[split], t: L.tier, p: (S.places[id] || {})[split] || null, f: packFive(save, t), w });
        }
    }
}
/** Something more happened to a club's split: an international, a promotion. */
export function markSplit(team, year, split, tag, extra) {
    const r = team && splitRow(team, year, split);
    if (!r) return;
    if (tag && !r.w.includes(tag)) r.w.push(tag);
    if (extra) Object.assign(r, extra);
}

/** A player who retires or leaves the world keeps a slim record, so his name and career still read. */
export function archivePlayer(save, p, year) {
    // Only someone who played in the save can appear in a club's history; the rest
    // (an unsigned prospect, a free agent nobody wanted) leave no trace, which keeps
    // the archive to a few hundred names over a decade.
    if (!p || !(p.car && p.car.g > 0)) return;
    if (!save.retired || typeof save.retired !== 'object') save.retired = {};
    save.retired[p.id] = {
        name: p.name, role: p.role, real: !!p.real, cc: p.cc || null, flag: p.flag || null, nat: p.nat || null,
        y: year, peak: Math.max(ovrOf(p), Number(p.car && p.car.peak) || 0, ...(p.cy || []).map(x => x[2] || 0)),
        pro: p.pro || null, born: p.born || null, pers: p.pers || null,
        cy: (p.cy || []).slice(), car: { ...(p.car || {}) },
    };
}
/** The end of a year: where every player was, how good he was and what he did there.
 *  Anyone who moved during the year already has a row for the club he left. */
export function recordYear(save, year) {
    if (save.cyYear === year) return;
    save.cyYear = year;
    for (const p of Object.values(save.players)) {
        if (!p) continue;
        if (!Array.isArray(p.cy)) p.cy = [];
        const row = stintRow(p, year);
        if (p.team || row[3] > 0) p.cy.push(row[3] > 0 ? row : row.slice(0, 3));
        p.car = p.car || { g: 0, w: 0, titles: 0 };
        p.car.peak = Math.max(Number(p.car.peak) || 0, ovrOf(p));
    }
}
/** A club, alive or folded (the living league moves a folded club to `save.defunct`). */
export function anyTeam(save, id) {
    return (save.teams && save.teams[id]) || (save.defunct && save.defunct[id]) || null;
}
/** A player, alive or retired: what the modal and the history lists can show. */
export function personOf(save, id) {
    return (save.players && save.players[id]) || (save.retired && save.retired[id]) || null;
}

const TAG_TITLE = { league: 'league', tier2: 'tier2', msi: 'msi', worlds: 'worlds', firststand: 'firststand' };
const SPLIT_ORDER = ['wi', 'sp', 'su'];
/**
 * A player's whole club career: real cards before the save, then every split he
 * started in the save (club, tier, place, his OVR, what it won), and his year-end
 * club and rating. { pre, splits, years, titles }.
 */
export function playerCareer(save, db, id) {
    const out = { pre: [], splits: [], years: [], titles: [] };
    const person = personOf(save, id);
    if (!person) return out;
    const start = Number(save.time.startYear) || save.time.year;
    if (person.real && db) {
        const idx = personsIndex(db);
        const rec = idx.persons.get(id);
        if (rec) {
            const seen = new Set();
            for (const c of rec.cards.filter(c => c.year < start).sort((a, b) => a.year - b.year)) {
                const k = c.year + ':' + c.team;
                if (seen.has(k)) continue;
                seen.add(k);
                out.pre.push({ y: c.year, team: c.team, region: c.region, ovr: c.rating });
            }
            for (const c of db) {
                const kind = PRINT_KIND[c.quality];
                if (!kind || kind === 'worldsfinal' || c.year >= start) continue;
                if (String(c.name).toLowerCase() !== String(person.name).toLowerCase()) continue;
                out.titles.push({ y: c.year, kind, team: c.team, pre: true });
            }
        }
    }
    for (const t of [...Object.values(save.teams), ...Object.values(save.defunct || {})]) {
        for (const r of t.sh || []) {
            const me = unpackFive(r.f).find(x => x.id === id);
            if (!me) continue;
            out.splits.push({ y: r.y, s: r.s, teamId: t.id, tier: r.t, p: r.p, ovr: me.ovr, w: r.w || [], wp: r.wp, mp: r.mp, fp: r.fp });
            for (const tag of r.w || []) if (TAG_TITLE[tag]) out.titles.push({ y: r.y, kind: TAG_TITLE[tag], teamId: t.id });
        }
    }
    out.splits.sort((a, b) => a.y - b.y || SPLIT_ORDER.indexOf(a.s) - SPLIT_ORDER.indexOf(b.s));
    out.years = (person.cy || []).map(([y, teamId, ovr, g, w, k, d, a, rs, mvp]) => ({ y, teamId, ovr, g: g || 0, w: w || 0, k: k || 0, d: d || 0, a: a || 0, rs: rs || 0, mvp: mvp || 0 }));
    // This year so far, before it is written down.
    const live = save.players && save.players[id];
    if (live && live.st && live.st.g && save.cyYear !== save.time.year) {
        const [y, teamId, ovr, g, w, k, d, a, rs, mvp] = stintRow(live, save.time.year);
        if (g > 0) out.years.push({ y, teamId, ovr, g, w, k, d, a, rs, mvp, live: true });
    }
    // The cup has no split row; a medal is a medal.
    for (let i = 0; i < ((person.car && person.car.t && person.car.t.cup) || 0); i++) out.titles.push({ y: 0, kind: 'cup' });
    out.titles.sort((a, b) => a.y - b.y);
    return out;
}

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

const splitWord = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Titles the club won in this save: league and second-tier splits, First Stand, MSI, Worlds. */
export function saveHonours(save, team) {
    const out = [];
    const add = (year, kind, name) => out.push({ year, kind, name });
    for (const h of save.history || []) {
        for (const [key, id] of Object.entries(h.champs || {})) {
            if (id !== team.id) continue;
            const [, tier, split] = key.split(':');
            add(h.year, tier === '1' ? 'league' : 'tier2', splitWord(split));
        }
        if (h.firststand === team.id) add(h.year, 'firststand', 'First Stand');
        if (h.msi === team.id) add(h.year, 'msi', 'MSI');
        if (h.worlds === team.id) add(h.year, 'worlds', 'Worlds');
    }
    // This year, before it is written to history.
    const S = save.season;
    if (S && !(save.history || []).some(h => h.year === S.year)) {
        for (const [key, b] of Object.entries(S.playoffs || {})) {
            if (b.champion !== team.id) continue;
            const [, tier, split] = key.split(':');
            add(S.year, tier === '1' ? 'league' : 'tier2', splitWord(split));
        }
        if (S.firststand && S.firststand.champion === team.id) add(S.year, 'firststand', 'First Stand');
        if (S.msi && S.msi.champion === team.id) add(S.year, 'msi', 'MSI');
        if (S.worlds && S.worlds.champion === team.id) add(S.year, 'worlds', 'Worlds');
    }
    for (const tr of (save.manager.trophies || [])) if (tr.kind === 'promotion' && tr.teamId === team.id) add(tr.year, 'promotion', 'Promotion');
    return out.sort((a, b) => a.year - b.year);
}

/** Everyone with a row at this club, alive or retired, added up: Map id -> totals. */
export function clubRecord(save, teamId) {
    const out = new Map();
    const scan = (id, who) => {
        for (const r of who.cy || []) {
            if (r[1] !== teamId) continue;
            let e = out.get(id);
            if (!e) { e = { n: who.name, r: who.role, real: !!who.real, y0: r[0], y1: r[0], s: 0, ly: 0, g: 0, w: 0, k: 0, d: 0, a: 0, rs: 0, mvp: 0, best: 0 }; out.set(id, e); }
            if (e.ly !== r[0]) { e.ly = r[0]; e.s++; }
            e.y0 = Math.min(e.y0, r[0]); e.y1 = Math.max(e.y1, r[0]);
            e.best = Math.max(e.best, r[2] || 0);
            e.g += r[3] || 0; e.w += r[4] || 0; e.k += r[5] || 0; e.d += r[6] || 0; e.a += r[7] || 0; e.rs += r[8] || 0; e.mvp += r[9] || 0;
        }
    };
    for (const [id, p] of Object.entries(save.players || {})) scan(id, p);
    for (const [id, p] of Object.entries(save.retired || {})) if (!(save.players || {})[id]) scan(id, p);
    return out;
}

// ---------------------------------------------------------------- the all-time list
const _preTitles = { db: null, start: null, map: null };
/** What real pros won before the save began, from the special prints: name -> { worlds, msi, firststand }. */
function preSaveTitles(db, start) {
    if (_preTitles.db === db && _preTitles.start === start) return _preTitles.map;
    const map = new Map();
    for (const c of db || []) {
        const kind = PRINT_KIND[c.quality];
        if (!kind || kind === 'worldsfinal' || c.year >= start) continue;
        const k = String(c.name).toLowerCase();
        const e = map.get(k) || {};
        e[kind] = (e[kind] || 0) + 1;
        map.set(k, e);
    }
    Object.assign(_preTitles, { db, start, map });
    return map;
}
/** How a career ranks against every other. Titles first, then awards, then longevity and peak. */
export function greatness(c, peak, pre = {}) {
    const t = c.t || {};
    const aw = c.aw || {};
    return (t.worlds || 0) * 45 + (pre.worlds || 0) * 45 + (t.msi || 0) * 25 + (pre.msi || 0) * 25
        + (t.firststand || 0) * 15 + (pre.firststand || 0) * 15 + (t.league || 0) * 18 + (t.cup || 0) * 6 + (t.tier2 || 0) * 5
        + (aw.mvp || 0) * 22 + (aw.allpro || 0) * 9 + (aw.rookie || 0) * 6 + (c.mvp || 0) * 0.5 + (c.g || 0) * 0.08 + Math.max(0, (peak || 0) - 80) * 4;
}
/** Every player who has played in this save, alive or retired, best first. */
export function allTimeBest(save, db, { role = null, region = null, limit = 50 } = {}) {
    const pre = preSaveTitles(db, Number(save.time.startYear) || save.time.year);
    const rows = [];
    const add = (id, p, alive) => {
        const c = p.car || {};
        if (!(c.g > 0)) return;
        if (role && p.role !== role) return;
        const rowsOf = p.cy || [];
        const home = rowsOf.length ? rowsOf[rowsOf.length - 1][1] : p.team;
        if (region && p.nat !== region) return;
        const peak = Math.max(Number(c.peak) || 0, Number(p.peak) || 0, alive ? ovrOf(p) : 0, ...rowsOf.map(x => x[2] || 0));
        const was = p.real ? pre.get(String(p.name).toLowerCase()) || {} : {};
        const t = c.t || {};
        rows.push({
            id, n: p.name, r: p.role, flag: p.flag || null, real: !!p.real, alive, team: alive ? p.team : null, last: home, peak,
            g: c.g || 0, w: c.w || 0, k: c.k || 0, d: c.d || 0, a: c.a || 0, rs: c.rs || 0, mvp: c.mvp || 0,
            worlds: (t.worlds || 0) + (was.worlds || 0), msi: (t.msi || 0) + (was.msi || 0), firststand: (t.firststand || 0) + (was.firststand || 0),
            league: t.league || 0, cup: t.cup || 0, titles: c.titles || 0, aw: c.aw || {}, pro: p.pro || null,
            score: Math.round(greatness(c, peak, was)),
        });
    };
    for (const [id, p] of Object.entries(save.players || {})) add(id, p, true);
    for (const [id, p] of Object.entries(save.retired || {})) if (!(save.players || {})[id]) add(id, p, false);
    return rows.sort((a, b) => b.score - a.score || b.g - a.g).slice(0, limit);
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
    // Every split this club played in the save: its starters, from the split rows.
    // A club the manager runs also has `team.hist` (games, wins, awards, the bench),
    // which is preferred for any player it holds.
    const fromRows = new Map();
    for (const r of team.sh || []) {
        for (const x of unpackFive(r.f)) {
            if (!x.id || (team.hist && team.hist[x.id])) continue;
            const who = personOf(save, x.id);
            let e = fromRows.get(x.id);
            if (!e) {
                e = { id: x.id, n: who ? who.name : x.id.replace(/^[rg]:/, ''), r: x.role, real: !!(who && who.real), y0: r.y, y1: r.y, s: 0, ly: 0, g: 0, w: 0, mvp: 0, t: {}, aw: [], best: 0 };
                fromRows.set(x.id, e);
            }
            if (e.ly !== r.y) { e.ly = r.y; e.s++; }
            e.y0 = Math.min(e.y0, r.y); e.y1 = Math.max(e.y1, r.y);
            e.best = Math.max(e.best, x.ovr || 0);
            for (const tag of r.w || []) if (TAG_TITLE[tag]) e.t[TAG_TITLE[tag]] = (e.t[TAG_TITLE[tag]] || 0) + 1;
        }
    }
    // Games and wins of everyone who ever played here, starter or sub, from the players' own rows.
    for (const [id, c] of clubRecord(save, team.id)) {
        if (team.hist && team.hist[id]) continue;
        let e = fromRows.get(id);
        if (!e) {
            e = { id, n: c.n, r: c.r, real: c.real, y0: c.y0, y1: c.y1, s: 0, ly: 0, g: 0, w: 0, mvp: 0, t: {}, aw: [], best: 0 };
            fromRows.set(id, e);
        }
        e.g = c.g; e.w = c.w; e.mvp = c.mvp; e.k = c.k; e.d = c.d; e.a = c.a; e.rs = c.rs;
        e.s = Math.max(e.s, c.s);
        e.y0 = Math.min(e.y0, c.y0); e.y1 = Math.max(e.y1, c.y1);
        e.best = Math.max(e.best, c.best);
    }
    for (const [id, h] of fromRows) {
        const cur = merged.get(id);
        if (cur) {
            cur.s += h.s; cur.g += h.g; cur.w += h.w; cur.mvp += h.mvp; cur.y0 = Math.min(cur.y0, h.y0); cur.y1 = Math.max(cur.y1, h.y1);
            for (const [k, n] of Object.entries(h.t)) cur.t[k] = (cur.t[k] || 0) + n;
            cur.inSave = true;
        } else merged.set(id, { ...h, inSave: true, pre: false });
    }
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
        return { ...e, current: roster.has(e.id), retired: !!(save.retired && save.retired[e.id] && !save.players[e.id]), score, tier: legendTier(score), titles: titleCount(e) };
    }).sort((a, b) => b.score - a.score || b.y1 - a.y1);
    const honours = [...real.honours.map(h => ({ ...h, pre: true })), ...saveHonours(save, team)];
    // Promotions and relegations of any club, from its split rows (the manager's own
    // promotions are already in saveHonours from the trophy cabinet).
    for (const r of team.sh || []) {
        if (r.w.includes('up') && !honours.some(h => h.kind === 'promotion' && h.year === r.y)) honours.push({ year: r.y, kind: 'promotion', name: 'Promotion' });
        if (r.w.includes('down')) honours.push({ year: r.y, kind: 'relegation', name: 'Relegation' });
    }
    honours.sort((a, b) => a.year - b.year);
    // The season-by-season story, newest first: both splits of each year with the five who started.
    const years = new Map();
    for (const r of team.sh || []) {
        if (!years.has(r.y)) years.set(r.y, { y: r.y, wi: null, sp: null, su: null });
        years.get(r.y)[r.s] = { ...r, five: unpackFive(r.f).map(x => ({ ...x, n: x.id ? (personOf(save, x.id) || {}).name || x.id.replace(/^[rg]:/, '') : null, alive: !!(x.id && save.players[x.id]), known: !!(x.id && personOf(save, x.id)) })) };
    }
    const seasons = [...years.values()].sort((a, b) => b.y - a.y);
    return { players, honours, seasons, tracked: !!team.hist, trackedFrom: team.histFrom || null, before };
}
