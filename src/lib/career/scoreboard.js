// =====================================================================
//  LoL ULTIMATE CAREER - scoreboard normaliser
// =====================================================================
//  match.js hangs a `board` off every entry of the game log, so a Bo5
//  carries five of them; finishMatch persists the lot as result.games and
//  the same array survives on c.lastMatch.games. THREE screens read it -
//  the per-game interstitial and the end-of-series screen in MatchDay,
//  the simulated-result panel in CareerOverlay, and the Hub - and the
//  normaliser used to exist as a near-identical copy inside each of them.
//  Three copies of a defensive read is three chances for one of them to
//  drift and blank a screen, so it lives here once.
//
//  PURE, and it imports constants.js and NOTHING ELSE. No store, no
//  engine.js, no economy.js: every caller is a Svelte component and
//  tools/careerRender.mjs loads all of them through a single SSR module
//  graph, where a store import from a leaf module is how that graph
//  starts breaking.
//
//  The board is ABSENT on a benched game and on every save written before
//  it existed. Absent must render NOTHING - not an empty table and not a
//  row of dashes - so a board that does not normalise yields no rows, no
//  rows yield no board, and no board yields no section at the call site.
//
//  Champions are stored as IDS, which are permanent save data. A renamed
//  or retired one resolves to '' and prints no champion, never the raw id.
//
//  ASCII only - this repo has been corrupted by encoding issues before.

import { ROLE_BY_ID, CHAMPION_BY_ID } from './constants.js';

function num(v, fb = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
}

/** One seat. Lifted verbatim from MatchDay's sbRow, which is also what
 *  CareerOverlay's copy was. */
function sbRow(r, i, mine) {
    if (!r || typeof r !== 'object') return null;
    const roleId = typeof r.role === 'string' ? r.role : '';
    const def = ROLE_BY_ID[roleId] || null;
    const champ = (typeof r.champ === 'string' && r.champ) ? CHAMPION_BY_ID[r.champ] : null;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    return {
        key: (mine ? 'a' : 'e') + i,
        name: name || 'Unknown Player',
        // The three-letter ID, not ROLE_BY_ID.short - "Jungle" and
        // "Support" do not fit a badge column on a phone. The lookup still
        // earns its keep: it validates the seat and names it in the title.
        role: def ? def.id : String(roleId).slice(0, 3).toUpperCase(),
        roleName: def ? def.name : '',
        champ: champ && typeof champ.name === 'string' ? champ.name : '',
        k: Math.max(0, Math.round(num(r.k))),
        d: Math.max(0, Math.round(num(r.d))),
        a: Math.max(0, Math.round(num(r.a))),
        me: mine && r.me === true,
    };
}

function sbSide(list, mine) {
    return Array.isArray(list) ? list.map((r, i) => sbRow(r, i, mine)).filter(Boolean) : [];
}

/**
 * One game log entry -> one renderable scoreboard.
 *
 * @param {*} game   an entry of result.games / c.lastMatch.games / match.gameLog
 * @param {number} index its position in that array, used for the row keys and
 *                       as the fallback game number
 * @returns {{ key: string, number: number, won: boolean, mins: number,
 *             ally: object[], enemy: object[] } | null}
 *          null for an absent or rotted board, and for one where either side
 *          normalises to zero rows.
 */
export function normaliseBoard(game, index) {
    const i = Number.isFinite(Number(index)) ? Number(index) : 0;
    const b = (game && typeof game === 'object' && game.board) || null;
    if (!b || typeof b !== 'object') return null;
    const ally = sbSide(b.ally, true);
    const enemy = sbSide(b.enemy, false);
    if (!ally.length || !enemy.length) return null;
    const mins = Math.round(num(game && game.duration));
    return {
        key: 'sb' + i,
        number: Math.max(1, Math.round(num(game && game.game, i + 1))),
        won: !!(game && (game.won ?? game.win ?? game.victory)),
        mins: mins > 0 ? mins : 0,
        ally,
        enemy,
    };
}

/**
 * A whole game log -> one board per GAME, in the order they were played,
 * with the empties dropped. A Bo5 is five of them; a benched series is none.
 *
 * @param {*} games anything. A non-array yields [].
 * @returns {object[]}
 */
export function normaliseBoards(games) {
    if (!Array.isArray(games)) return [];
    return games.map(normaliseBoard).filter(Boolean);
}
