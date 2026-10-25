// Matches the photos in /PlayerPictures to cards in the card database and wires them in.
//
//   node tools/buildPlayerPictures.mjs
//
// Re-run it whenever pictures are added. It copies every matched photo to public/players/
// (Vite serves that folder as-is) and rewrites src/lib/data/playerPictures.js, a plain
// { cardId: '/players/<file>' } map that Card.svelte reads. Nothing is matched by hand.
//
// File names are TEAM_Player_YEAR_Event.webp (e.g. T1_Faker_2024_Split_2.webp). Also handled:
// the year after the event (T1_Faker_Worlds_2021), a bare Player+Year (Faker2014), and an
// all-star shot (LCK_Faker_2019_AS) whose first token is a league rather than a team.
//
// A photo goes to a card of the same player, from the card's own YEAR when one exists and
// otherwise from the NEAREST year (a 2013 card with no 2013 photo takes the 2014 one; on a tie
// the later year wins). Another team's photo is only used when the player has no photo in this
// card's team, or team-less, at any year — the wrong jersey is a last resort. Among the photos
// of the chosen year, a Worlds shot is preferred for Champion / Finalist / MVP cards and a
// regular-season shot for everything else; a matching team beats an all-star or team-less shot.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'PlayerPictures');
const OUT_DIR = join(ROOT, 'public', 'players');
const MAP_FILE = join(ROOT, 'src', 'lib', 'data', 'playerPictures.js');

// Team names in file names → the team string the card database uses.
const TEAM_ALIASES = { GRF: 'Griffin', GEN: 'Gen.G', SKTK: 'SKTK', 'SKT T1': 'SKT' };
// One org under every name it has played as. The card database spells a team the way it was
// called THAT year (Ruler: SSG 2016-17, Gen.G 2018-22; ShowMaker: DWG and DK both used for
// 2020-22; Faker: SKT, SKTK, T1), while a photo is named however its source named it — so a
// rename must never make a player's own photo count as another team's jersey.
const ORG_GROUPS = [
    ['SKT', 'SKTK', 'SKT T1', 'T1'],
    ['DWG', 'DK', 'DAMWON', 'DWG KIA', 'DPLUS KIA'],
    ['SSG', 'KSV', 'GEN', 'GEN.G', 'SAMSUNG'],
    ['GRF', 'GRIFFIN'],
    ['HLE', 'HANWHA'],
    ['VG', 'VICI'],
];
const ORG_OF = new Map(ORG_GROUPS.flatMap((g, i) => g.map(t => [t, 'org' + i])));
const org = (t) => { const k = String(t || '').toUpperCase(); return ORG_OF.get(k) || k; };
// First tokens that are a league or event, not a team.
const NOT_TEAMS = new Set(['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL', 'MSI', 'WORLDS']);
const WORLDS_TIERS = new Set(['Champion', 'Finalist', 'MVP']);
const exactTeam = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();
const sameTeam = (a, b) => org(a) === org(b);

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, 'public', 'database.js'), 'utf8'), ctx);
const db = ctx.window.playerDatabase || ctx.playerDatabase;
if (!Array.isArray(db)) { console.error('Could not load public/database.js'); process.exit(1); }
const names = new Map(db.map(c => [c.name.toLowerCase(), c.name]));

function parse(file) {
    const base = file.replace(/\.(webp|png|jpe?g)$/i, '');
    let tokens = base.split('_');
    // Faker2014 → ['Faker', '2014']
    if (tokens.length === 1) { const m = base.match(/^([A-Za-z]+)(\d{4})$/); if (m) tokens = [m[1], m[2]]; }
    const yearTok = tokens.find(t => /^\d{4}$/.test(t));
    const nameTok = tokens.find(t => names.has(t.toLowerCase()));
    if (!yearTok || !nameTok) return null;
    const first = tokens[0];
    const team = first !== nameTok && first !== yearTok && !NOT_TEAMS.has(first.toUpperCase()) ? (TEAM_ALIASES[first] || first) : null;
    const event = tokens.filter(t => t !== first && t !== nameTok && t !== yearTok).join(' ') || (team ? '' : first);
    const kind = /\b(WC|Worlds)\b/i.test(event) ? 'worlds' : /\bAS\b/.test(event) || (!team && NOT_TEAMS.has(first.toUpperCase())) ? 'allstar' : 'season';
    return { file, player: names.get(nameTok.toLowerCase()), year: Number(yearTok), team, event, kind };
}

const files = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter(f => /\.(webp|png|jpe?g)$/i.test(f)) : [];
const pics = [];
const unparsed = [];
for (const f of files) { const p = parse(f); if (p) pics.push(p); else unparsed.push(f); }

// A photo in this card's team, or one with no team on it (an all-star or bare Player+Year shot).
const teamOk = (card, pic) => !pic.team || sameTeam(pic.team, card.team);

function score(card, pic) {
    let s = 0;
    if (pic.team && exactTeam(pic.team, card.team)) s += 30;       // the exact name on the card
    else if (pic.team && sameTeam(pic.team, card.team)) s += 25;   // the same org under another name
    if (WORLDS_TIERS.has(card.quality)) s += pic.kind === 'worlds' ? 20 : pic.kind === 'season' ? 5 : 0;
    else s += pic.kind === 'season' ? 20 : pic.kind === 'worlds' ? 8 : 0;
    // Among same-kind photos, the one taken latest in the season (closest to the card's moment).
    s += seasonOrder(pic.event);
    return s;
}
// Where in a year an event sits: LCK Cup opens it, Spring/Split 1 → Summer/Split 2 → Split 3.
function seasonOrder(event) {
    if (/cup/i.test(event)) return 0;
    if (/spring/i.test(event)) return 1;
    if (/summer/i.test(event)) return 2;
    const n = (event.match(/\d+/g) || []).map(Number);
    return Math.min(4, n.length ? Math.max(...n) : 0);
}

const map = {};
const used = new Set();
const borrowed = [];   // cards that took a photo from another year, for the report
for (const card of db) {
    const mine = pics.filter(p => p.player === card.name);
    if (!mine.length) continue;
    const year = Number(card.year);
    const ok = mine.filter(p => teamOk(card, p));
    const pool = ok.length ? ok : mine;
    // Nearest year first; on a tie the later year (closer to the player the card collector knows).
    const dist = (p) => Math.abs(p.year - year);
    const nearest = Math.min(...pool.map(dist));
    const yearPics = pool.filter(p => dist(p) === nearest);
    const pickYear = Math.max(...yearPics.map(p => p.year));
    let best = null, bestScore = -Infinity;
    for (const p of yearPics.filter(p => p.year === pickYear)) { const s = score(card, p); if (s > bestScore) { best = p; bestScore = s; } }
    if (!best) continue;
    map[card.id] = `/players/${best.file}`;
    used.add(best.file);
    if (best.year !== year || !teamOk(card, best)) borrowed.push(`${card.name} ${card.team} ${card.year} ${card.quality} <- ${best.file}`);
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(MAP_FILE), { recursive: true });
for (const f of used) copyFileSync(join(SRC_DIR, f), join(OUT_DIR, f));
// public/players holds exactly the photos in use — a stale one would ship in every build.
for (const f of readdirSync(OUT_DIR)) if (!used.has(f)) unlinkSync(join(OUT_DIR, f));

const ids = Object.keys(map).sort((a, b) => Number(a) - Number(b));
const body = ids.map(id => {
    const c = db.find(x => String(x.id) === id);
    return `    ${id}: '${map[id]}',  // ${c.name} - ${c.team} ${c.year} - ${c.quality}`;
}).join('\n');
// ASCII only: this file is regenerated, and a tool that misreads UTF-8 must not be able to garble it.
writeFileSync(MAP_FILE, `// GENERATED by tools/buildPlayerPictures.mjs - do not edit by hand; re-run the script.
// Card id -> player photo served from public/players/. Read by Card.svelte.
export const PLAYER_PICTURES = {
${body}
};

export function pictureFor(card) {
    return (card && PLAYER_PICTURES[card.id]) || null;
}
`);

const pictured = new Set(pics.map(p => p.player));
const missing = db.filter(c => pictured.has(c.name) && !map[c.id]);
console.log(`photos: ${files.length} · matched ${ids.length} cards using ${used.size} photos`);
const unusedPics = pics.filter(p => !used.has(p.file)).map(p => p.file);
if (unusedPics.length) console.log('photos with no card: ' + unusedPics.join(', '));
if (unparsed.length) console.log('could not read a player/year from: ' + unparsed.join(', '));
if (borrowed.length) console.log('photo from the nearest year (none for the card\'s own year or team): ' + borrowed.join(' · '));
if (missing.length) console.log('pictured players\' cards still without a photo: ' + missing.map(c => `${c.name} ${c.team} ${c.year} ${c.quality}`).join(' · '));
