// ===========================================================================
//  ULTIMATE MANAGER -- data tables
//
//  Everything here is plain data or a pure helper over it. The mode is built
//  from four kinds of thing:
//    people   real pros (from the card database, STANDARD tiers only -- never a
//             Champion/MVP/legacy/award/Hall of Legends print) and random
//             players generated for the save, who are always labelled as such
//    teams    the real orgs of a region in the start year, plus random teams
//             where a region has fewer real orgs than its leagues need
//    a year   Winter split, playoffs, First Stand, Spring split, playoffs, MSI,
//             Summer split, playoffs, promotion and relegation, Worlds, the offseason
//    you      a manager with a level, perks, a board and a budget
//
//  Ids written into a save (personality, tactic, training, perk, attribute,
//  champion) are permanent: rename the label, never the id.
// ===========================================================================
import { ROLE_BY_ID as CAREER_ROLE_BY_ID, REGION_BY_ID as CAREER_REGION_BY_ID, CHAMPIONS } from '../career/constants.js';

export const MANAGER_SAVE_VERSION = 1;

// ---------------------------------------------------------------- start years
export const START_YEARS = [
    { year: 2013, name: 'The First Dynasty', blurb: 'Season Three. SK Telecom T1 have just found a mid laner called Faker, Royal Club and OMG rule China, and Europe is Fnatic against Gambit.' },
    { year: 2017, name: 'The Korean Wall', blurb: 'Korea has won four Worlds in a row. Samsung, SKT and Longzhu own the LCK, while G2 and EDG try to break the wall.' },
    { year: 2020, name: 'The New Guard', blurb: 'DAMWON, TOP Esports and a rebuilt G2. The LPL is the deepest league on earth and every region thinks this is its year.' },
    { year: 2023, name: 'The Superteams', blurb: 'JDG\'s grand slam run, T1\'s second wind and Gen.G\'s quiet machine. Bilibili and LNG are stacked too.' },
    { year: 2026, name: 'Right Now', blurb: 'The present day. Every current roster, every current rookie, and six regions with a path to Worlds.' },
];
export const DEFAULT_START_YEAR = 2013;

// ---------------------------------------------------------------- regions
export const REGION_IDS = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'];
export const REGIONS = REGION_IDS.map(id => {
    const r = CAREER_REGION_BY_ID[id];
    return { id, name: r.name, league: r.league, flag: r.flag, accent: r.accent };
});
export const REGION_BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
// Wages and sponsors are priced per region. China and North America pay the most,
// Brazil and the Pacific the least -- the same order Ultimate Career uses.
export const REGION_MONEY = { LCK: 1.0, LPL: 1.2, LEC: 1.0, LCS: 1.3, LCP: 0.72, CBLOL: 0.64 };
// A wage climbs WAGE_STEP an OVR point up to WAGE_KNEE and WAGE_TOP_STEP after it, so a
// 99 asks about 2.3x what an 88 does rather than 4x.
export const WAGE_STEP = 1.118;
export const WAGE_KNEE = 88;
export const WAGE_TOP_STEP = 1.08;
// The money in the game grows with the game. The card ratings, and so the world's OVR and
// every wage priced off it, rise from 2013 to 2026; club income is scaled by the same curve
// at the world's level (the mean OVR of every tier-1 starter, taken once a year), so a 2026
// club can pay 2026 wages. ECON_REF_LEVEL is the level at which the scale is 1.
export const ECON_REF_LEVEL = 80;
// Club income by reputation: a floor every club has, and a part that grows with the
// square of reputation, because the biggest orgs earn far more than a mid-table side.
export const SPONSOR_BASE = 900000;
export const SPONSOR_REP = 4200000;
// Reputation an org's real titles before the start year add when the world is built
// (from the card database's Champion / MSI / First Stand prints), up to `max`.
export const PRESTIGE = { worlds: 3, msi: 2, firststand: 1, max: 10 };
// Owner investment: a club already paying more than its limit when the world is built (an
// early-era superteam far above its league) has owners who fund it, with INVEST_ROOM of
// headroom. The excess fades by INVEST_DECAY a year: the club is expected to pay its way.
export const INVEST_ROOM = 1.08;
export const INVEST_DECAY = 0.8;
// The second-tier league of each region. Every region gets one, named plainly.
export const TIER2_NAME = { LCK: 'LCK Challengers', LPL: 'LDL', LEC: 'EMEA Masters', LCS: 'NACL', LCP: 'LCP Challengers', CBLOL: 'CBLOL Academy' };

/** The level a region's academies produce talent at: random prospects are built
 *  around it, so the pecking order survives once real cards run out (after 2026). */
export const REGION_LEVEL = { LCK: 84, LPL: 84, LEC: 81, LCS: 78, LCP: 77, CBLOL: 76 };
/** Free agency is topped up to at least this many players per region each offseason. */
export const FREE_AGENT_FLOOR = 30;

/** A region that has no real cards in the start year borrows the nearest year
 *  that does: up to four years back, or up to two years ahead. */
export const DATA_LOOKBACK = 4;
export const DATA_LOOKAHEAD = 2;

// ---------------------------------------------------------------- roles
export const ROLE_IDS = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
export const ROLES = ROLE_IDS.map(id => {
    const r = CAREER_ROLE_BY_ID[id];
    return { id, name: r.name, short: r.short, icon: r.icon, accent: r.accent };
});
export const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));

// ---------------------------------------------------------------- attributes
// The same six stats every card in the game carries, so a real player arrives
// with exactly the numbers on their card.
export const ATTRS = [
    { key: 'mec', short: 'MEC', name: 'Mechanics',   color: '#38bdf8', blurb: 'Raw hands: outplays, skillshots, winning a lane on execution.' },
    { key: 'tmf', short: 'TMF', name: 'Teamfight',   color: '#fb923c', blurb: 'Positioning and timing in five-versus-five fights.' },
    { key: 'map', short: 'MAP', name: 'Macro',       color: '#34d399', blurb: 'Rotations, vision, objective setups and reading the map.' },
    { key: 'frm', short: 'FRM', name: 'Consistency', color: '#c084fc', blurb: 'How reliably they hit their level. High FRM rarely has an off day.' },
    { key: 'cmp', short: 'CMP', name: 'Composure',   color: '#22d3ee', blurb: 'Calm under pressure: late games, deciders and big stages.' },
    { key: 'ldr', short: 'LDR', name: 'Leadership',  color: '#facc15', blurb: 'Shotcalling and the voice in comms. Lifts team chemistry.' },
];
export const ATTR_KEYS = ATTRS.map(a => a.key);
export const ATTR_BY_KEY = Object.fromEntries(ATTRS.map(a => [a.key, a]));
export const ATTR_MAX = 99;
export const ATTR_MIN = 30;

// OVR is a role-weighted mean of the six. Each row sums to exactly 1.
export const ROLE_WEIGHTS = {
    TOP: { mec: 0.22, tmf: 0.18, frm: 0.18, cmp: 0.16, map: 0.14, ldr: 0.12 },
    JNG: { map: 0.24, ldr: 0.18, mec: 0.16, tmf: 0.16, frm: 0.14, cmp: 0.12 },
    MID: { mec: 0.24, tmf: 0.18, frm: 0.16, map: 0.16, cmp: 0.14, ldr: 0.12 },
    ADC: { mec: 0.24, tmf: 0.22, frm: 0.18, cmp: 0.18, map: 0.10, ldr: 0.08 },
    SUP: { map: 0.22, ldr: 0.22, tmf: 0.18, cmp: 0.14, frm: 0.12, mec: 0.12 },
};

// ---------------------------------------------------------------- personalities
// Every effect listed in `effects` is read somewhere in the engine; the `does`
// line is what the player is told, and must stay true to those numbers.
export const PERSONALITIES = [
    { id: 'leader',       name: 'Leader',       color: '#facc15', weight: 7,
      blurb: 'Takes charge in comms and pulls the team together.',
      does: ['Team chemistry grows much faster while they start', 'Leadership grows faster when they level up', 'A small edge in every game while they start'],
      effects: { chemPerStep: 1.3, focusBias: 'ldr', edge: 0.15 } },
    { id: 'professional', name: 'Professional', color: '#60a5fa', weight: 10,
      blurb: 'Shows up, does the work, never makes headlines.',
      does: ['+15% training XP', 'Practises on their own: +30% personal training', 'Plays closer to their level every game', 'Declines more slowly with age'],
      effects: { xpMult: 1.15, selfTrain: 1.3, varianceMult: 0.75, declineMult: 0.7 } },
    { id: 'prodigy',      name: 'Prodigy',      color: '#c084fc', weight: 6,
      blurb: 'Gifted and knows it. Grows fast, sulks on the bench.',
      does: ['+40% XP while 21 or younger', 'Morale drops twice as fast when benched'],
      effects: { youngXpMult: 1.4, benchMoraleMult: 2 } },
    { id: 'hothead',      name: 'Hothead',      color: '#f87171', weight: 7,
      blurb: 'All gas. Can take over a game, or tilt it away.',
      does: ['Much bigger swings game to game, both ways', 'Morale swings harder after results', 'Two Hotheads in a lineup cost chemistry'],
      effects: { varianceMult: 1.8, resultMoraleMult: 1.5, clash: true } },
    { id: 'teamplayer',   name: 'Team Player',  color: '#34d399', weight: 10,
      blurb: 'Plays for the five, accepts any role you give them.',
      does: ['Chemistry grows faster while they start', 'Never loses morale on the bench'],
      effects: { chemPerStep: 0.6, benchMoraleMult: 0 } },
    { id: 'showman',      name: 'Showman',      color: '#fb923c', weight: 6,
      blurb: 'Lives for the crowd. The bigger the stage, the better.',
      does: ['Plays above their level in playoffs and at MSI and Worlds', 'Unhappy on the bench'],
      effects: { bigStage: 4, benchMoraleMult: 1.5 } },
    { id: 'grinder',      name: 'Grinder',      color: '#a3e635', weight: 8,
      blurb: 'Sixteen hours of solo queue a day, every day.',
      does: ['+30% training XP', 'Personal training counts double'],
      effects: { xpMult: 1.3, selfTrain: 2 } },
    { id: 'laidback',     name: 'Laid-back',    color: '#94a3b8', weight: 7,
      blurb: 'Nothing gets to them. Nothing motivates them much either.',
      does: ['Morale barely moves, good or bad', '-15% training XP', 'Hardly practises on their own'],
      effects: { xpMult: 0.85, selfTrain: 0.4, resultMoraleMult: 0.5 } },
    { id: 'ambitious',    name: 'Ambitious',    color: '#f472b6', weight: 7,
      blurb: 'Here to win titles, and wants paying like it.',
      does: ['+10% training XP', 'Asks for 20% higher wages', 'Loses morale while the team sits outside the top four'],
      effects: { xpMult: 1.1, wageMult: 1.2, wantsContender: true } },
    { id: 'loyal',        name: 'Loyal',        color: '#2dd4bf', weight: 7,
      blurb: 'Bleeds the team colours. Hard to prise away.',
      does: ['Renews for 15% less', 'Morale stays steadier', 'Rival clubs struggle to sign them'],
      effects: { renewMult: 0.85, resultMoraleMult: 0.75, hardToBuy: true } },
    { id: 'clutch',       name: 'Clutch',       color: '#fbbf24', weight: 5,
      blurb: 'Wants the ball when the series is on the line.',
      does: ['Plays well above their level in a deciding game'],
      effects: { decider: 5 } },
    { id: 'nervous',      name: 'Nervous',      color: '#a78bfa', weight: 5,
      blurb: 'Brilliant in scrims. The lights get to them.',
      does: ['Plays below their level in playoffs and at MSI and Worlds', 'Calmer with every big series they play'],
      effects: { bigStage: -4 } },
    { id: 'mentor',       name: 'Mentor',       color: '#fde68a', weight: 5,
      blurb: 'Has seen it all, and enjoys passing it on.',
      does: ['Teammates of 22 or under gain extra XP every week', 'Chemistry grows while they start', 'Declines a little more slowly'],
      effects: { mentorXp: 6, chemPerStep: 0.4, declineMult: 0.85 } },
    { id: 'streamer',     name: 'Streamer',     color: '#e879f9', weight: 5,
      blurb: 'Half a pro, half a brand. The fans love them.',
      does: ['Brings your club new fans every week', '-10% training XP', 'Asks for 5% higher wages'],
      effects: { fanPull: 0.12, xpMult: 0.9, wageMult: 1.05 } },
    { id: 'perfectionist', name: 'Perfectionist', color: '#7dd3fc', weight: 5,
      blurb: 'Rewatches every death. Nothing is ever good enough.',
      does: ['+20% training XP', 'Personal training +50%', 'Takes defeats far harder than anyone else'],
      effects: { xpMult: 1.2, selfTrain: 1.5, lossMorale: 1.7 } },
    { id: 'shotcaller',   name: 'Shotcaller',   color: '#fcd34d', weight: 5,
      blurb: 'The voice everybody listens to in comms.',
      does: ['A real edge in every game while they start', 'Leadership grows faster', 'Chemistry grows while they start'],
      effects: { edge: 0.25, focusBias: 'ldr', chemPerStep: 0.3 } },
    { id: 'lonewolf',     name: 'Lone Wolf',    color: '#fca5a5', weight: 4,
      blurb: 'Plays their own game. It usually works, for them.',
      does: ['Plays above their level every game', 'Costs chemistry every week they start'],
      effects: { seat: 1.5, chemPerStep: -0.6 } },
    { id: 'adaptive',     name: 'Adaptive',     color: '#5eead4', weight: 5,
      blurb: 'Settles anywhere and picks things up fast.',
      does: ['Learns a language more than twice as fast', 'Personal training +20%'],
      effects: { langMult: 2.2, selfTrain: 1.2 } },
    { id: 'latebloomer',  name: 'Late Bloomer', color: '#bef264', weight: 5,
      blurb: 'Written off at twenty, peaks at twenty-five.',
      does: ['Keeps growing like a player three years younger', 'Declines a little more slowly'],
      effects: { lateGrowth: true, declineMult: 0.85 } },
    { id: 'mercenary',    name: 'Mercenary',    color: '#fdba74', weight: 4,
      blurb: 'Goes where the money is, and says so.',
      does: ['Will sign for any club that pays', 'Asks for 15% higher wages and 10% more to renew'],
      effects: { moneyFirst: true, wageMult: 1.15, renewMult: 1.1 } },
    { id: 'ironwill',     name: 'Iron Will',    color: '#cbd5e1', weight: 5,
      blurb: 'Plays through anything. Never misses a scrim.',
      does: ['Far fewer injuries', 'Declines more slowly', 'Morale stays steadier'],
      effects: { injuryMult: 0.4, declineMult: 0.8, resultMoraleMult: 0.8 } },
    { id: 'joker',        name: 'Joker',        color: '#f9a8d4', weight: 5,
      blurb: 'Keeps the room laughing, on and off the Rift.',
      does: ['Lifts the morale of the whole squad every week', 'Chemistry grows while they start', 'A little less consistent'],
      effects: { squadMorale: 0.35, chemPerStep: 0.3, varianceMult: 1.15 } },
    { id: 'glasscannon',  name: 'Glass Cannon', color: '#fb7185', weight: 4,
      blurb: 'Incredible hands, and the wrists to match.',
      does: ['Plays above their level every game', 'Gets injured far more often'],
      effects: { seat: 1.2, injuryMult: 1.9 } },
];
export const PERSONALITY_BY_ID = Object.fromEntries(PERSONALITIES.map(p => [p.id, p]));

/** Two personalities in one five. `edge` is team edge, for clubs of every kind. */
export const PERSONALITY_COMBOS = [
    { a: 'leader', b: 'prodigy', name: 'Captain and Protege', edge: 0.2, blurb: 'A young star who listens to a real captain.' },
    { a: 'mentor', b: 'prodigy', name: 'Master and Apprentice', edge: 0.25, blurb: 'The veteran brings the talent along.' },
    { a: 'hothead', b: 'laidback', name: 'Fire and Ice', edge: 0.2, blurb: 'Nothing tilts the laid-back one, and it rubs off.' },
    { a: 'showman', b: 'clutch', name: 'Big Game Duo', edge: 0.25, blurb: 'Both want the ball when it matters.' },
    { a: 'grinder', b: 'perfectionist', name: 'Scrim Monsters', edge: 0.2, blurb: 'Nobody leaves the practice room first.' },
    { a: 'shotcaller', b: 'teamplayer', name: 'One Voice', edge: 0.25, blurb: 'A clear call, and someone who will always follow it.' },
    { a: 'leader', b: 'loyal', name: 'Heart of the Club', edge: 0.2, blurb: 'The dressing room runs itself.' },
    { a: 'lonewolf', b: 'teamplayer', name: 'Carry and Enabler', edge: 0.15, blurb: 'One plays for himself, one plays for him.' },
    { a: 'nervous', b: 'leader', name: 'Steadying Hand', edge: 0.15, blurb: 'A calm voice on the big stage.' },
    { a: 'professional', b: 'professional', name: 'Total Professionals', edge: 0.2, blurb: 'A room with no drama in it.' },
    { a: 'ambitious', b: 'ambitious', name: 'Title or Bust', edge: 0.15, blurb: 'Two people who will not accept second.' },
    { a: 'joker', b: 'nervous', name: 'Taking the Edge Off', edge: 0.15, blurb: 'Hard to be nervous when you are laughing.' },
    { a: 'hothead', b: 'hothead', name: 'Powder Keg', edge: -0.3, blurb: 'Two tempers, one comms channel.' },
    { a: 'shotcaller', b: 'shotcaller', name: 'Two Voices', edge: -0.25, blurb: 'Nobody knows whose call to follow.' },
    { a: 'lonewolf', b: 'lonewolf', name: 'Nobody Passes', edge: -0.3, blurb: 'Two players, two different games.' },
    { a: 'mercenary', b: 'loyal', name: 'Culture Clash', edge: -0.2, blurb: 'One is here for the club, one for the cheque.' },
];

// ---------------------------------------------------------------- play styles
// How a player plays, read off the attribute he is strongest in for his role, so it moves
// as he develops and needs no save data. Styles that fit together are a combo below.
export const PLAYSTYLES = {
    TOP: [{ id: 'carrytop', name: 'Carry Top', attr: 'mec' }, { id: 'frontline', name: 'Frontline', attr: 'tmf' }, { id: 'splitter', name: 'Split Pusher', attr: 'map' }, { id: 'weakside', name: 'Weak-Side Anchor', attr: 'cmp' }],
    JNG: [{ id: 'invader', name: 'Invader', attr: 'mec' }, { id: 'ganker', name: 'Early Ganker', attr: 'frm' }, { id: 'pathing', name: 'Pathing Genius', attr: 'map' }, { id: 'engagejg', name: 'Engage Jungler', attr: 'tmf' }],
    MID: [{ id: 'playmaker', name: 'Playmaker', attr: 'mec' }, { id: 'roamer', name: 'Roaming Mid', attr: 'map' }, { id: 'controlmid', name: 'Control Mage', attr: 'tmf' }, { id: 'anchormid', name: 'Lane Anchor', attr: 'cmp' }],
    ADC: [{ id: 'lanebully', name: 'Lane Bully', attr: 'mec' }, { id: 'hypercarry', name: 'Hypercarry', attr: 'tmf' }, { id: 'safeadc', name: 'Safe Scaler', attr: 'cmp' }, { id: 'utilityadc', name: 'Utility Marksman', attr: 'map' }],
    SUP: [{ id: 'engagesup', name: 'Engage Support', attr: 'tmf' }, { id: 'roamsup', name: 'Roaming Support', attr: 'map' }, { id: 'enchanter', name: 'Enchanter', attr: 'cmp' }, { id: 'shotsup', name: 'Shotcalling Support', attr: 'ldr' }],
};
/** Styles that fit together. Worth `edge` of team edge on the plan named, 40% of it on any other. */
export const PLAYSTYLE_COMBOS = [
    { id: 'stranglehold', name: 'Early Stranglehold', tactic: 'early', edge: 0.4, need: { JNG: ['invader', 'ganker'], MID: ['roamer', 'playmaker'] }, blurb: 'Mid and jungle win the map before anyone has an item.' },
    { id: 'botkingdom', name: 'Bot Kingdom', tactic: 'early', edge: 0.35, need: { ADC: ['lanebully'], SUP: ['engagesup'] }, blurb: 'A bot lane that kills from level two.' },
    { id: 'hyperprotect', name: 'Protect the Hypercarry', tactic: 'scaling', edge: 0.4, need: { ADC: ['hypercarry', 'safeadc'], SUP: ['enchanter'] }, blurb: 'Everything goes through one carry who must not die.' },
    { id: 'weakside', name: 'Weak-Side Bargain', tactic: 'scaling', edge: 0.3, need: { TOP: ['weakside', 'frontline'], ADC: ['hypercarry'] }, blurb: 'Top survives alone so bot can have everything.' },
    { id: 'controlcore', name: 'Control Core', tactic: 'scaling', edge: 0.3, need: { MID: ['controlmid', 'anchormid'], ADC: ['safeadc', 'utilityadc'] }, blurb: 'Nothing happens until they say so.' },
    { id: 'sidelane', name: 'Side-Lane Pressure', tactic: 'split', edge: 0.4, need: { TOP: ['splitter', 'carrytop'], JNG: ['pathing'] }, blurb: 'A top laner the jungler can always cover for.' },
    { id: 'mapcontrol', name: 'Map Control', tactic: 'vision', edge: 0.4, need: { JNG: ['pathing'], SUP: ['roamsup', 'shotsup'] }, blurb: 'They are always where you are going to be.' },
    { id: 'roamduo', name: 'Roaming Duo', tactic: 'vision', edge: 0.3, need: { MID: ['roamer'], SUP: ['roamsup'] }, blurb: 'Two players who are never in lane.' },
    { id: 'frontback', name: 'Front to Back', tactic: 'teamfight', edge: 0.35, need: { TOP: ['frontline'], ADC: ['hypercarry', 'utilityadc'] }, blurb: 'A wall, and someone shooting over it.' },
    { id: 'engagechain', name: 'Engage Chain', tactic: 'teamfight', edge: 0.4, need: { JNG: ['engagejg'], SUP: ['engagesup'] }, blurb: 'One lock-down after another.' },
];

// ---------------------------------------------------------------- tactics
// Five plans in a circle: each beats the next two and loses to the two before it.
// What the game is decided ON is the average of both teams' phase weights, so
// picking a plan steers the game toward the phase your roster wins.
export const TACTICS = [
    { id: 'early',     name: 'Early Aggression', short: 'Early',     color: '#ef4444', icon: 'flame',
      blurb: 'Snowball lanes, invade, dive towers before twelve minutes.',
      phases: { early: 0.5, mid: 0.3, late: 0.2 }, fit: { mec: 1, frm: 1 }, fitRoles: ['JNG', 'MID', 'TOP'],
      why: 'Punishes slow plans before they come online.' },
    { id: 'scaling',   name: 'Scaling',          short: 'Scaling',   color: '#a855f7', icon: 'trend',
      blurb: 'Give up the early game, farm, and win the late teamfights.',
      phases: { early: 0.15, mid: 0.3, late: 0.55 }, fit: { tmf: 1, cmp: 1 }, fitRoles: ['ADC', 'MID'],
      why: 'Out-scales anything that cannot end the game early.' },
    { id: 'split',     name: 'Split Push',       short: 'Split',     color: '#f59e0b', icon: 'swords',
      blurb: 'One carry in a side lane, four holding the map, constant pressure.',
      phases: { early: 0.3, mid: 0.45, late: 0.25 }, fit: { mec: 1, map: 1 }, fitRoles: ['TOP', 'JNG'],
      why: 'Stretches slow, grouped plans until they break.' },
    { id: 'vision',    name: 'Vision Control',   short: 'Vision',    color: '#22d3ee', icon: 'map',
      blurb: 'Deep wards, picks and every objective set up a minute early.',
      phases: { early: 0.25, mid: 0.5, late: 0.25 }, fit: { map: 1, ldr: 1 }, fitRoles: ['SUP', 'JNG'],
      why: 'Spots every gank and denies every engage angle.' },
    { id: 'teamfight', name: 'Teamfight',        short: 'Teamfight', color: '#22c55e', icon: 'swords',
      blurb: 'Group five, force fights at every objective.',
      phases: { early: 0.25, mid: 0.3, late: 0.45 }, fit: { tmf: 1, ldr: 1 }, fitRoles: ['SUP', 'ADC', 'JNG'],
      why: 'Collapses on dives and forces fights before a scaling comp is ready.' },
];
export const TACTIC_BY_ID = Object.fromEntries(TACTICS.map(t => [t.id, t]));
// a beats b
export const TACTIC_BEATS = {
    early:     ['scaling', 'split'],
    scaling:   ['split', 'vision'],
    split:     ['vision', 'teamfight'],
    vision:    ['teamfight', 'early'],
    teamfight: ['early', 'scaling'],
};
/** +1 when a's plan counters b's, -1 when it is countered, 0 otherwise. */
export function tacticEdge(a, b) {
    if (!a || !b || a === b) return 0;
    if ((TACTIC_BEATS[a] || []).includes(b)) return 1;
    if ((TACTIC_BEATS[b] || []).includes(a)) return -1;
    return 0;
}
/** Win-chance points a counter is worth (before the Tactician perk). */
export const COUNTER_EDGE = 2.5;

// ---------------------------------------------------------------- the draft
/** Fearless draft: a champion played in a series cannot be played again in that
 *  series, by either side. Compulsory in every season from this year on; before
 *  it, a setting on the Club screen. */
export const FEARLESS_FROM = 2024;

/**
 * The tournament draft, twenty actions in this order:
 *   ban phase 1   blue, red, blue, red, blue, red
 *   pick phase 1  B1 · R1 R2 · B2 B3 · R3
 *   ban phase 2   red, blue, red, blue
 *   pick phase 2  R4 · B4 B5 · R5   (red has the last pick of the draft)
 */
export const DRAFT_ORDER = [
    ...['blue', 'red', 'blue', 'red', 'blue', 'red'].map(side => ({ side, type: 'ban', phase: 1 })),
    ...['blue', 'red', 'red', 'blue', 'blue', 'red'].map(side => ({ side, type: 'pick', phase: 1 })),
    ...['red', 'blue', 'red', 'blue'].map(side => ({ side, type: 'ban', phase: 2 })),
    ...['red', 'blue', 'blue', 'red'].map(side => ({ side, type: 'pick', phase: 2 })),
];

// Pick value, in rating points on the player's seat.
/** A signature champion (the three favourites). */
export const FAV_BONUS = 3;
/** A champion in the player's wider pool. What carries a team through a fearless Bo5. */
export const POOL_BONUS = 1.5;
/** Strong this split: +META_BONUS; weak: -META_BONUS. */
export const META_BONUS = 2;
/** One step of a lane matchup (championMatchup runs -2.5..2.5): a hard counter is
 *  worth about a signature pick, and costs the countered side the same. */
export const MATCHUP_STEP = 1.5;

/** Champions that are better together. `bonus` is in team edge (a signature
 *  pick on one seat is worth about 0.6), so a famous duo is worth a real pick. */
export const DUO_SYNERGIES = [
    { a: 'xayah', b: 'rakan', name: 'The Lovers', bonus: 0.8 },
    { a: 'kalista', b: 'thresh', name: 'Oathsworn Hook', bonus: 0.7 },
    { a: 'kalista', b: 'nautilus', name: 'Fling and Anchor', bonus: 0.5 },
    { a: 'yasuo', b: 'malphite', name: 'Wind and Stone', bonus: 0.8 },
    { a: 'yasuo', b: 'gragas', name: 'Knock-up Combo', bonus: 0.5 },
    { a: 'yasuo', b: 'alistar', name: 'Headbutt Combo', bonus: 0.5 },
    { a: 'yasuo', b: 'diana', name: 'Moonfall Combo', bonus: 0.5 },
    { a: 'yone', b: 'diana', name: 'Moonfall Combo', bonus: 0.4 },
    { a: 'kogmaw', b: 'lulu', name: 'Hypercarry Lulu', bonus: 0.8 },
    { a: 'jinx', b: 'lulu', name: 'Hypercarry Lulu', bonus: 0.6 },
    { a: 'twitch', b: 'lulu', name: 'Hypercarry Lulu', bonus: 0.6 },
    { a: 'zeri', b: 'yuumi', name: 'Battery Lane', bonus: 0.6 },
    { a: 'zeri', b: 'lulu', name: 'Hypercarry Lulu', bonus: 0.6 },
    { a: 'lucian', b: 'nami', name: 'Tidecaller\'s Blessing', bonus: 0.8 },
    { a: 'lucian', b: 'braum', name: 'Heart and Gun', bonus: 0.5 },
    { a: 'kaisa', b: 'nautilus', name: 'Lock and Load', bonus: 0.6 },
    { a: 'samira', b: 'nautilus', name: 'Style Points', bonus: 0.6 },
    { a: 'samira', b: 'rell', name: 'Style Points', bonus: 0.6 },
    { a: 'draven', b: 'leona', name: 'Kill Lane', bonus: 0.5 },
    { a: 'aphelios', b: 'thresh', name: 'Lantern Lane', bonus: 0.5 },
    { a: 'senna', b: 'tahmkench', name: 'Devour Funnel', bonus: 0.7 },
    { a: 'ezreal', b: 'karma', name: 'Poke Lane', bonus: 0.5 },
    { a: 'varus', b: 'karma', name: 'Poke Lane', bonus: 0.4 },
    { a: 'orianna', b: 'jarvan', name: 'Ball Delivery', bonus: 0.6 },
    { a: 'orianna', b: 'malphite', name: 'Shockwave Combo', bonus: 0.6 },
    { a: 'missfortune', b: 'amumu', name: 'Bullet Time Wombo', bonus: 0.6 },
    { a: 'missfortune', b: 'sejuani', name: 'Bullet Time Wombo', bonus: 0.4 },
    { a: 'twistedfate', b: 'nocturne', name: 'Global Pressure', bonus: 0.6 },
    { a: 'twistedfate', b: 'galio', name: 'Global Pressure', bonus: 0.5 },
    { a: 'masteryi', b: 'taric', name: 'Starlight Duo', bonus: 0.8 },
    { a: 'kennen', b: 'jarvan', name: 'Cataclysm Storm', bonus: 0.5 },
    { a: 'zilean', b: 'kayle', name: 'Second Life', bonus: 0.4 },
    { a: 'sett', b: 'yasuo', name: 'Showstopper Combo', bonus: 0.4 },
    { a: 'ivern', b: 'kindred', name: 'Jungle Friends', bonus: 0.3 },
    { a: 'nilah', b: 'seraphine', name: 'Shared Shields', bonus: 0.6 },
    { a: 'nilah', b: 'leona', name: 'Dive Partners', bonus: 0.5 },
    { a: 'xayah', b: 'nautilus', name: 'Feather Lock', bonus: 0.4 },
    { a: 'vayne', b: 'lulu', name: 'Hypercarry Lulu', bonus: 0.6 },
    { a: 'ashe', b: 'braum', name: 'Freljord Lane', bonus: 0.6 },
    { a: 'sejuani', b: 'ashe', name: 'Winter\'s Claw', bonus: 0.4 },
    { a: 'jarvan', b: 'galio', name: 'Cataclysm Taunt', bonus: 0.5 },
    { a: 'lillia', b: 'kennen', name: 'Sleeping Storm', bonus: 0.4 },
    { a: 'rumble', b: 'jarvan', name: 'Equalizer Trap', bonus: 0.5 },
    { a: 'ziggs', b: 'lulu', name: 'Pocket Bomb', bonus: 0.3 },
    { a: 'renekton', b: 'nidalee', name: 'Shurima Dive', bonus: 0.4 },
    { a: 'pantheon', b: 'twistedfate', name: 'Falling Star', bonus: 0.5 },
    { a: 'sylas', b: 'jarvan', name: 'Stolen Cataclysm', bonus: 0.4 },
    { a: 'ryze', b: 'twistedfate', name: 'Global Rift', bonus: 0.4 },
];

/**
 * Team compositions, by archetype. A five that fits one plays better together,
 * and better again on the game plan the style wants. Only the best style counts.
 * `test` reads archetype counts (and the top laner's archetype, for split push).
 */
export const COMP_STYLES = [
    { id: 'teamfight', name: 'Wombo Teamfight', color: '#22c55e', icon: 'swords', bonus: 0.6, tactic: 'teamfight',
      blurb: 'Hard engage and area damage. Wins the five-versus-five.', need: 'An engage tank or catcher and two mages.',
      test: (n) => (n.Vanguard + n.Catcher) >= 1 && (n.Mage + n.Battlemage) >= 2 },
    { id: 'protect', name: 'Protect the Carry', color: '#a855f7', icon: 'shield', bonus: 0.6, tactic: 'scaling',
      blurb: 'Everything keeps one carry alive until they melt the game.', need: 'A hypercarry or marksman and two peelers.',
      test: (n) => (n.Hypercarry + n.Marksman) >= 1 && (n.Enchanter + n.Warden + n.Utility) >= 2 },
    { id: 'dive', name: 'Dive', color: '#ef4444', icon: 'flame', bonus: 0.5, tactic: 'early',
      blurb: 'Jump the backline before it can do anything.', need: 'Three divers, assassins or skirmishers.',
      test: (n) => (n.Diver + n.Assassin + n.Skirmisher) >= 3 },
    { id: 'poke', name: 'Poke & Siege', color: '#22d3ee', icon: 'target', bonus: 0.5, tactic: 'vision',
      blurb: 'Chip them down from range and take towers without a fight.', need: 'Two poke champions, or one and two mages.',
      test: (n) => n.Poke * 2 + n.Mage >= 4 },
    { id: 'pick', name: 'Pick Comp', color: '#38bdf8', icon: 'search', bonus: 0.4, tactic: 'vision',
      blurb: 'Catch one out, kill them, take the objective four against five.', need: 'A catcher and an assassin.',
      test: (n) => n.Catcher >= 1 && n.Assassin >= 1 },
    { id: 'split', name: 'Split Push', color: '#f59e0b', icon: 'swords', bonus: 0.4, tactic: 'split',
      blurb: 'A duelist in the side lane that nobody can stop alone.', need: 'A duelist, skirmisher or juggernaut top, and one more.',
      test: (n, top) => ['Duelist', 'Skirmisher', 'Juggernaut'].includes(top) && (n.Duelist + n.Skirmisher + n.Juggernaut) >= 2 },
    { id: 'frontback', name: 'Front to Back', color: '#84cc16', icon: 'shield', bonus: 0.5, tactic: 'teamfight',
      blurb: 'A wall up front and a carry behind it. Simple and hard to break.', need: 'Two frontliners and a marksman.',
      test: (n) => (n.Juggernaut + n.Vanguard + n.Warden) >= 2 && (n.Marksman + n.Hypercarry) >= 1 },
    { id: 'skirmish', name: 'Skirmish', color: '#fb923c', icon: 'swords', bonus: 0.45, tactic: 'early',
      blurb: 'Small fights all over the map, won on mechanics.', need: 'Three duelists, skirmishers or lane bullies.',
      test: (n) => (n.Duelist + n.Skirmisher + n['Lane Bully']) >= 3 },
    { id: 'kite', name: 'Disengage and Kite', color: '#a78bfa', icon: 'target', bonus: 0.45, tactic: 'scaling',
      blurb: 'They run at you, you walk away, and they die.', need: 'A marksman, a warden or enchanter, and a mage or poke.',
      test: (n) => (n.Marksman + n.Hypercarry) >= 1 && (n.Warden + n.Enchanter) >= 1 && (n.Mage + n.Poke) >= 1 },
];
export const COMP_STYLE_BY_ID = Object.fromEntries(COMP_STYLES.map(c => [c.id, c]));
/**
 * Which archetypes each plan wants, read off the comp styles that pay `COMP_TACTIC_BONUS`
 * for it: the draft tags a champion with the plans its archetype fits.
 */
export const TACTIC_ARCHETYPES = {
    early: ['Diver', 'Assassin', 'Skirmisher'],
    scaling: ['Hypercarry', 'Marksman', 'Enchanter', 'Warden', 'Utility'],
    split: ['Duelist', 'Skirmisher', 'Juggernaut'],
    vision: ['Poke', 'Catcher', 'Assassin', 'Mage'],
    teamfight: ['Vanguard', 'Catcher', 'Mage', 'Battlemage'],
};
/** Extra edge when the comp's style is the plan you are playing. */
export const COMP_TACTIC_BONUS = 0.3;
/** A five with no tank at all is easy to dive and impossible to engage with. */
export const NO_FRONTLINE_PENALTY = 0.5;

// ---------------------------------------------------------------- training
// One team focus for the week, kept until changed.
export const TRAINING = [
    { id: 'balanced',   name: 'Balanced',     icon: 'dumbbell', xp: 22, chem: 1, morale: 0,
      blurb: 'A normal week: scrims in the afternoon, solo queue at night.' },
    { id: 'individual', name: 'Solo Practice', icon: 'bolt',    xp: 32, chem: -1, morale: -1,
      blurb: 'Everyone grinds their own game. The most XP, at a small cost to chemistry.' },
    { id: 'scrims',     name: 'Heavy Scrims', icon: 'swords',   xp: 16, chem: 3, morale: 0,
      blurb: 'Block after block against other teams. Builds chemistry fast.' },
    { id: 'draft',      name: 'Draft Prep',   icon: 'target',   xp: 12, chem: 1, morale: 0, draftPrep: 1,
      blurb: 'Study the next opponent. Every champion your players pick next match is worth a little more.' },
    { id: 'rest',       name: 'Rest',         icon: 'moon',     xp: 0,  chem: 0, morale: 6,
      blurb: 'Days off. No XP, but morale recovers.' },
];
export const TRAINING_BY_ID = Object.fromEntries(TRAINING.map(t => [t.id, t]));

// ---------------------------------------------------------------- the level system
// 480, not 300: the year grew from 33 steps to 53, and every weekly and match XP figure
// was tuned on a level per so many weeks. Growth per YEAR stays what it was.
export const XP_PER_LEVEL = 480;
export const POINTS_PER_LEVEL = 2;
/** What one attribute point is worth once a player's OVR has reached their potential. */
export const PAST_CEILING_FACTOR = 0.25;
export const MATCH_XP = { series: 30, gameWon: 10, mvp: 20, bench: 8 };
/** XP a player earns on his own every week: solo queue and VODs, club or no club, before
 *  his personality's `selfTrain`. A free agent has nothing else, so he gets a little more. */
export const SELF_TRAIN_XP = 4;
export const SELF_TRAIN_FREE_AGENT = 7;
/** A player well short of his potential makes up ground: up to +60% XP at this gap. */
export const CATCH_UP_GAP = 12;
export const CATCH_UP_MAX = 0.6;

// ---------------------------------------------------------------- manager level
export const MGR_XP_PER_LEVEL = 640;
export const MGR_XP = { seriesWin: 40, seriesLoss: 12, title: 300, intlTitle: 500, worlds: 900, objective: 150, promotion: 250 };

/** The skill tree: five branches. Every `rank` line is read by the engine and
 *  must stay true to it. Ids are save data -- rename labels, never ids. */
export const PERK_BRANCHES = [
    { id: 'tactics', name: 'Tactics', icon: 'map', color: '#22d3ee', blurb: 'Game plans and the calls you make in a game.' },
    { id: 'draft', name: 'Draft', icon: 'target', color: '#f472b6', blurb: 'Champion select: comfort, counters and pools.' },
    { id: 'development', name: 'Development', icon: 'upgrade', color: '#34d399', blurb: 'Growing players, from the academy up.' },
    { id: 'people', name: 'Man Management', icon: 'heart', color: '#fbbf24', blurb: 'Morale, chemistry and keeping a room together.' },
    { id: 'business', name: 'Business', icon: 'coins', color: '#a78bfa', blurb: 'Money, the market and the board.' },
];
export const PERKS = [
    // Tactics
    { id: 'tactician',  branch: 'tactics', name: 'Tactical Mind',   icon: 'map',      max: 3,
      blurb: 'Your counters hit harder.',
      rank: (n) => `+${n} to every tactic counter${n >= 1 ? ', and opponents\' plans are scouted exactly' : ''}` },
    { id: 'shotcaller', branch: 'tactics', name: 'Shotcaller', icon: 'chat', max: 3,
      blurb: 'Your in-game calls work more often.',
      rank: (n) => `+${n * 4}% success on every in-game call` },
    { id: 'analyst',    branch: 'tactics', name: 'Video Analyst', icon: 'video', max: 2,
      blurb: 'Know their draft before it happens.',
      rank: (n) => `Counter-picks worth +${n * 20}%${n >= 1 ? ', and their likely bans are shown before the series' : ''}` },
    // Draft
    { id: 'drafter',    branch: 'draft', name: 'Draft Genius',    icon: 'target',   max: 3,
      blurb: 'Comfort picks and meta picks are worth more.',
      rank: (n) => `+${(n * 0.5).toFixed(1)} on every signature or strong meta pick` },
    { id: 'poolmaster', branch: 'draft', name: 'Deep Pools', icon: 'cards', max: 3,
      blurb: 'Your players are better on their wider champion pools. Made for fearless.',
      rank: (n) => `+${(n * 0.5).toFixed(1)} on every pool champion` },
    // Development
    { id: 'developer',  branch: 'development', name: 'Player Developer', icon: 'upgrade', max: 3,
      blurb: 'Your players level up faster.',
      rank: (n) => `+${n * 10}% XP for every player` },
    { id: 'mentor',     branch: 'development', name: 'Mentor', icon: 'academy', max: 2,
      blurb: 'The bench keeps learning.',
      rank: (n) => `+${n * 50}% XP for players who do not start` },
    { id: 'youth',      branch: 'development', name: 'Academy Director', icon: 'sparkle', max: 3,
      blurb: 'Your academy finds talent every year.',
      rank: (n) => `${n} academy prospect${n === 1 ? '' : 's'} with real potential join your academy every preseason` },
    // Man management
    { id: 'motivator',  branch: 'people', name: 'Motivator',       icon: 'heart',    max: 3,
      blurb: 'Team talks land, defeats sting less.',
      rank: (n) => `Team talks +${n * 30}% stronger, -${n * 15}% morale lost after a defeat` },
    { id: 'psychologist', branch: 'people', name: 'Sports Psychologist', icon: 'shield', max: 2,
      blurb: 'Nerves, tilt and the bench hurt less.',
      rank: (n) => `-${n * 30}% morale lost on the bench, steadier Hotheads and calmer Nervous players` },
    { id: 'teambuilder', branch: 'people', name: 'Team Builder', icon: 'squad', max: 3,
      blurb: 'A room that gels faster.',
      rank: (n) => `+${(n * 0.5).toFixed(1)} chemistry every week` },
    // Business
    { id: 'negotiator', branch: 'business', name: 'Negotiator',      icon: 'briefcase', max: 3,
      blurb: 'Cheaper wages and transfer fees.',
      rank: (n) => `-${n * 4}% wages, -${n * 5}% transfer fees` },
    { id: 'commercial', branch: 'business', name: 'Commercial Sense', icon: 'coins',   max: 3,
      blurb: 'Better sponsor deals.',
      rank: (n) => `+${n * 8}% sponsor income` },
    { id: 'scout',      branch: 'business', name: 'Scouting Network', icon: 'search',  max: 3,
      blurb: 'See potential more clearly, scout for less.',
      rank: (n) => n >= 3 ? 'Every potential is shown exactly, scouting is free' : `Potential ranges ${['', 'narrower', 'much narrower'][n]}, scouting -${n * 30}%` },
    { id: 'agent',      branch: 'business', name: 'Super Agent', icon: 'trade', max: 3,
      blurb: 'Listed players sell faster and for more.',
      rank: (n) => `+${n} interested club${n === 1 ? '' : 's'} for every listed player, +${n * 5}% on every sale` },
    { id: 'boardroom',  branch: 'business', name: 'Board Diplomat', icon: 'flag', max: 3,
      blurb: 'The board forgives more.',
      rank: (n) => `-${n * 15}% board confidence lost${n >= 3 ? ', and a second emergency signing every season' : ''}` },
];
export const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));

/** One-off uses for a perk point, for when the tree is full or something is needed now. */
export const POINT_ACTIONS = [
    { id: 'bootcamp', name: 'Bootcamp', icon: 'dumbbell', blurb: 'A week abroad: every player +150 XP and +4 chemistry.' },
    { id: 'board', name: 'Board Meeting', icon: 'briefcase', blurb: 'Talk the board round: +10 board confidence.' },
    { id: 'sponsor', name: 'Sponsor Drive', icon: 'coins', blurb: 'A new partner: 12% of a year\'s sponsor income, now.' },
    { id: 'scouting', name: 'Scouting Trip', icon: 'search', blurb: 'Every free agent in your region is scouted: exact potential.' },
    { id: 'stake', name: 'Ownership Stake', icon: 'crown', blurb: 'The owners reward you with 10% of the club. Own half and the board cannot sack you; own all of it and the board is gone.' },
];

// ---------------------------------------------------------------- achievements
/** Ids are save data. `point` gives a perk point the first time. */
export const ACHIEVEMENTS = [
    { id: 'first_title', name: 'First Silverware', icon: 'trophy', point: true, desc: 'Win any title.' },
    { id: 'league_title', name: 'Domestic Champions', icon: 'trophy', desc: 'Win a split title in your league.' },
    { id: 'double', name: 'Domestic Double', icon: 'medal', point: true, desc: 'Win two domestic titles in the same year.' },
    { id: 'first_stand', name: 'First to the Flag', icon: 'flag', point: true, desc: 'Win First Stand.' },
    { id: 'msi', name: 'Mid-Season Kings', icon: 'globe', point: true, desc: 'Win MSI.' },
    { id: 'worlds', name: 'World Champions', icon: 'crown', point: true, desc: 'Win Worlds.' },
    { id: 'intl_double', name: 'International Double', icon: 'gem', point: true, desc: 'Win MSI and Worlds in the same year.' },
    { id: 'golden_road', name: 'Golden Road', icon: 'crown', point: true, desc: 'Win Spring, MSI, Summer and Worlds in one year. Every title there is.' },
    { id: 'back2back', name: 'Back to Back', icon: 'crown', point: true, desc: 'Win Worlds two years running.' },
    { id: 'dynasty', name: 'Dynasty', icon: 'crown', point: true, target: 3, desc: 'Win Worlds three times.' },
    { id: 'perfect_split', name: 'Perfect Split', icon: 'star', point: true, desc: 'Go unbeaten through a regular season.' },
    { id: 'sweep_final', name: 'Clean Sweep', icon: 'bolt', desc: 'Win a final 3-0.' },
    { id: 'reverse_sweep', name: 'Reverse Sweep', icon: 'trend', point: true, desc: 'Win a best of five from 0-2 down.' },
    { id: 'giant_killer', name: 'Giant Killer', icon: 'skull', desc: 'Knock out a side 5+ OVR stronger in a playoff or international series.' },
    { id: 'worlds_debut', name: 'World Stage', icon: 'globe', desc: 'Qualify for Worlds.' },
    { id: 'promoted', name: 'Going Up', icon: 'upgrade', point: true, desc: 'Win promotion to a top league.' },
    { id: 'basement', name: 'From the Basement', icon: 'trend', point: true, desc: 'Win a top-league title with a club you managed in the second tier.' },
    { id: 'built', name: 'Built From Nothing', icon: 'sparkle', point: true, desc: 'Win a title with a club you founded.' },
    { id: 'underdog', name: 'Underdog Story', icon: 'flame', point: true, desc: 'Win a split title the board expected you to finish 5th or worse in.' },
    { id: 'fearless_champ', name: 'Fearless', icon: 'shield', desc: 'Win a title under fearless draft.' },
    { id: 'mvp_maker', name: 'MVP Factory', icon: 'star', desc: 'One of your players is a league\'s Player of the Year.' },
    { id: 'talent', name: 'Talent Spotter', icon: 'academy', desc: 'One of your players is a league\'s Rookie of the Year.' },
    { id: 'centurion', name: 'Centurion', icon: 'swords', point: true, target: 100, desc: 'Win 100 series.' },
    { id: 'loyal', name: 'One-Club Manager', icon: 'heart', point: true, target: 5, desc: 'Manage the same club for five seasons.' },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

// ---------------------------------------------------------------- squad status
/** Promised in a contract. Changes what the bench costs a player in morale. */
export const SQUAD_STATUS = [
    { id: 'key', name: 'Key player', bench: 3, blurb: 'Starts every match. Benching him hurts.' },
    { id: 'regular', name: 'Regular starter', bench: 2, blurb: 'Expects to play most weeks.' },
    { id: 'rotation', name: 'Rotation', bench: 0.5, blurb: 'Accepts sitting out some weeks.' },
];
export const SQUAD_STATUS_BY_ID = Object.fromEntries(SQUAD_STATUS.map(s => [s.id, s]));

// ---------------------------------------------------------------- training
/** How hard one player trains, on top of the team plan. Multiplies his weekly
 *  training XP and moves his morale a little every week. Ids are save data. */
export const INTENSITY = [
    { id: 'light', name: 'Light', xp: 0.6, morale: 1, blurb: 'Fewer hours. Morale recovers.' },
    { id: 'normal', name: 'Normal', xp: 1, morale: 0, blurb: 'The team plan, nothing more.' },
    { id: 'intense', name: 'Intense', xp: 1.5, morale: -1.5, blurb: 'Extra hours on his own game. Faster growth, and it wears on him.' },
];
export const INTENSITY_BY_ID = Object.fromEntries(INTENSITY.map(x => [x.id, x]));

/** What the players who do not start do with their week. `cost` is a share of a
 *  year's sponsor income, charged every week. */
export const BENCH_PROGRAMS = [
    { id: 'none', name: 'No programme', xp: 0, morale: 0, cost: 0, blurb: 'Subs train with the team and wait for a chance.' },
    { id: 'reserve', name: 'Reserve scrims', xp: 20, morale: 0, cost: 0.004, blurb: 'Your subs scrim other clubs\' academies every week.' },
    { id: 'academy', name: 'Reserve league', xp: 40, morale: 1, cost: 0.008, blurb: 'Your subs play real reserve matches. The most growth there is for players who do not start.' },
];
export const BENCH_PROGRAM_BY_ID = Object.fromEntries(BENCH_PROGRAMS.map(x => [x.id, x]));

/** Hands-on sessions: two a week, each paid for. `cost` is a share of a year's sponsor income. */
export const SESSIONS_PER_WEEK = 2;
export const SESSIONS = [
    { id: 'coach', name: '1-on-1 coaching', icon: 'user', target: 'player', xp: 110, cost: 0.006, blurb: 'A full day with the coaching staff for one player.' },
    { id: 'vod', name: 'VOD review', icon: 'video', target: 'team', xp: 35, chem: 2, cost: 0.004, blurb: 'The whole team goes through last week together. Everyone learns, and they learn it together.' },
    { id: 'pool', name: 'Champion practice', icon: 'cards', target: 'player', cost: 0.005, blurb: 'One player drills a strong champion of this split until it is in his pool. Made for fearless.' },
    { id: 'mental', name: 'Mental coaching', icon: 'heart', target: 'player', morale: 8, cost: 0.004, blurb: 'A session with the sports psychologist: +8 morale, and a cold streak is forgotten.' },
    { id: 'language', name: 'Language lessons', icon: 'chat', target: 'player', cost: 0.003, blurb: 'A week with a tutor in the club\'s language. Players who cannot talk to their team cost it in every fight.' },
];
export const SESSION_BY_ID = Object.fromEntries(SESSIONS.map(x => [x.id, x]));

/** Bootcamps: big, expensive, once a split each. */
export const BOOTCAMPS = [
    { id: 'korea', name: 'Seoul bootcamp', icon: 'flag', xp: 150, chem: 3, morale: -2, cost: 0.05, blurb: 'A week of LCK scrims in Seoul. The best practice in the world, far from home.' },
    { id: 'china', name: 'LPL scrim tour', icon: 'globe', xp: 120, chem: 4, morale: -1, cost: 0.045, blurb: 'Back-to-back scrim blocks against the LPL. Fast, bloody, educational.' },
    { id: 'retreat', name: 'Team retreat', icon: 'heart', xp: 0, chem: 5, morale: 8, cost: 0.03, blurb: 'No League for a week. Everyone comes back happier and closer.' },
    { id: 'grind', name: 'Solo queue camp', icon: 'flame', xp: 220, chem: -3, morale: -3, cost: 0.025, blurb: 'Sixteen hours a day of ranked. Huge growth, hard on everyone.' },
];
export const BOOTCAMP_BY_ID = Object.fromEntries(BOOTCAMPS.map(x => [x.id, x]));

// ---------------------------------------------------------------- ownership
/** A club the manager founded is theirs. Selling a stake brings in money and an
 *  investor board; selling a majority lets that board sack you. */
export const STAKE_TRANCHES = [10, 25];
/** The manager never sells below this. */
export const MIN_STAKE = 10;
/**
 * Club personalities: how a club behaves in the market (ids are save data). Drawn
 * once per club, stable per club id. `money` scales its sponsor income.
 */
export const CLUB_STYLES = [
    { id: 'balanced', name: 'Balanced', color: '#94a3b8', weight: 34, money: 1, blurb: 'No strong habits: signs who it needs.' },
    { id: 'youth', name: 'Youth academy', color: '#34d399', weight: 18, money: 0.95, blurb: 'Builds around young prospects and keeps its teenagers.' },
    { id: 'rich', name: 'Big spender', color: '#fbbf24', weight: 14, money: 1.25, blurb: 'Sponsors pour money in: a bigger wage budget than its size.' },
    { id: 'loyal', name: 'Loyal', color: '#60a5fa', weight: 17, money: 1, blurb: 'Keeps its veterans and renews almost everyone.' },
    { id: 'stars', name: 'Star hunter', color: '#f472b6', weight: 17, money: 1.05, blurb: 'Buys the best player it can afford from smaller clubs.' },
    // Training clubs: both make players far better than anyone else does. One sells them on.
    { id: 'factory', name: 'Talent factory', color: '#22d3ee', weight: 11, money: 0.95, train: 1.4, blurb: 'Trains young players hard, then sells them on for a profit. Its best prospects are for sale at a fair price.' },
    { id: 'dynasty', name: 'Dynasty builder', color: '#c084fc', weight: 9, money: 1, train: 1.3, blurb: 'Trains its players up and keeps them. Almost never sells, and asks a fortune when it does.' },
];
export const CLUB_STYLE_BY_ID = Object.fromEntries(CLUB_STYLES.map(x => [x.id, x]));

// ---------------------------------------------------------------- languages
// A team has to talk. Every league plays in one language; a player is fluent in his own
// and in the language of every region he held a card in. The five's mean level in the
// club's language is its communication; a five that cannot talk at all loses
// LANG_EDGE_MAX of team edge. Living there teaches it (LANG_IMMERSION a week at level 0,
// slowing as it rises), and Language lessons teach it faster. Codes are save data.
export const REGION_LANGUAGE = { LCK: 'ko', LPL: 'zh', LEC: 'en', LCS: 'en', LCP: 'en', CBLOL: 'pt' };
/** A club's working language: its league's, unless the manager has chosen another. */
export const teamLanguage = (team) => (team && team.lang) || REGION_LANGUAGE[team && team.region] || 'en';
export const LANGUAGE_NAMES = { ko: 'Korean', zh: 'Chinese', en: 'English', pt: 'Portuguese' };
export const COUNTRY_LANGUAGE = { KR: 'ko', CN: 'zh', TW: 'zh', HK: 'zh', BR: 'pt', PT: 'pt' };
export const LANG_IMMERSION = 3.1;
export const LANG_EDGE_MAX = 1.5;
export const LANG_LESSON = 22;
/** A language course for the whole squad, as a share of a year's sponsor income, before
 *  the discount: the more of the squad already speak it, the cheaper it is. */
export const LANG_COURSE_COST = 0.06;
/** Language lessons a course is worth, for every player at the club. */
export const LANG_COURSE_LESSONS = 2;
/** Changing a club's working language, as a share of a year's sponsor income, once a year. */
export const LANG_SWITCH_COST = 0.02;

// ---------------------------------------------------------------- imports
// A club may field at most IMPORT_MAX players from outside its region. A player who has
// played IMPORT_RESIDENCY years in a row in one region may be naturalised there (a roll
// each year) and stops counting as an import in it.
export const IMPORT_MAX = 2;
/** Where a real pro is really from, by his flag: a Korean in the LPL is an import. */
export const FLAG_REGION = { '🇰🇷': 'LCK', '🇨🇳': 'LPL', '🇧🇷': 'CBLOL', '🇺🇸': 'LCS', '🇨🇦': 'LCS', '🇹🇼': 'LCP', '🇭🇰': 'LCP', '🇻🇳': 'LCP', '🇯🇵': 'LCP', '🇦🇺': 'LCP', '🇵🇭': 'LCP', '🇹🇭': 'LCP', '🇸🇬': 'LCP', '🇲🇾': 'LCP', '🇮🇩': 'LCP', '🇳🇿': 'LCP', '🇪🇺': 'LEC', '🇩🇪': 'LEC', '🇫🇷': 'LEC', '🇪🇸': 'LEC', '🇬🇧': 'LEC', '🇵🇱': 'LEC', '🇸🇪': 'LEC', '🇩🇰': 'LEC', '🇳🇱': 'LEC', '🇧🇪': 'LEC', '🇨🇿': 'LEC', '🇸🇮': 'LEC', '🇭🇷': 'LEC', '🇬🇷': 'LEC', '🇮🇹': 'LEC', '🇵🇹': 'LEC', '🇳🇴': 'LEC', '🇫🇮': 'LEC', '🇷🇴': 'LEC', '🇧🇬': 'LEC', '🇱🇹': 'LEC', '🇷🇸': 'LEC', '🇹🇷': 'LEC' };
export const IMPORT_RESIDENCY = 5;
export const NATURALISE_CHANCE = 0.45;

// ---------------------------------------------------------------- the manager's money
/** What a hired manager earns a year, as a share of his club's market income. */
export const MANAGER_SALARY_SHARE = 0.055;
export const MANAGER_SALARY_MIN = 30000;
/** The most an owner may pay himself, as a share of his club's market income. */
export const OWNER_SALARY_MAX_SHARE = 0.2;
/** What a manager has in the bank on day one. */
export const MANAGER_START_BANK = 25000;
/** Buying a league place and founding a club there, at the reference economy. */
export const FOUND_COST = { 1: 5000000, 2: 1200000 };
/** Share of a held club's market income paid out to its owners each year. */
export const DIVIDEND_SHARE = 0.1;
/** A real org's commercial pull: more base income than a generated club of the same size. */
export const REAL_CLUB_MONEY = 1.3;

// ---------------------------------------------------------------- sponsors
// The manager's club earns a base revenue (streaming, merchandise, its league share)
// of SPONSOR_BASE_SHARE of its market income, plus the sponsor deals it lands. `share`
// is a slot's value as a share of the market income at average appeal; `diff` is how
// much harder that brand is to convince. Brand names are invented.
export const SPONSOR_BASE_SHARE = 0.5;
export const SPONSOR_PITCHES_PER_WEEK = 2;
export const SPONSOR_SLOTS = [
    { id: 'shirt', name: 'Shirt sponsor', icon: 'crown', share: 0.22, diff: 0.35, blurb: 'The name on the front of the jersey. The biggest deal, and the pickiest brands.' },
    { id: 'hardware', name: 'Hardware partner', icon: 'bolt', share: 0.12, diff: 0.2, blurb: 'Mice, keyboards, headsets and monitors.' },
    { id: 'drink', name: 'Energy drink', icon: 'flame', share: 0.1, diff: 0.15, blurb: 'Cans on the desk and in every stream.' },
    { id: 'apparel', name: 'Apparel and streaming', icon: 'sparkle', share: 0.08, diff: 0.1, blurb: 'Merchandise, chairs and a streaming platform.' },
];
export const SPONSOR_SLOT_BY_ID = Object.fromEntries(SPONSOR_SLOTS.map(x => [x.id, x]));
export const SPONSOR_BRANDS = {
    shirt: ['Nightfall Telecom', 'Apex Motors', 'Helix Bank', 'Orbit Airlines', 'Kairo Mobile', 'Vanta Insurance', 'Meridian Group', 'Stellar Logistics', 'Northstar Energy', 'Quanta Cloud'],
    hardware: ['Zephyr Peripherals', 'Pulse Gear', 'Kite Mice', 'Lumen Displays', 'Ion Headsets', 'Hexa Boards', 'Vector Labs', 'Prism Monitors'],
    drink: ['Volt Energy', 'Rush Cola', 'Blaze Drinks', 'Frost Fizz', 'Surge Shot', 'Nitro Brew', 'Spark Soda'],
    apparel: ['Northwind Apparel', 'Stride Wear', 'Glint Streaming', 'Echo Stream', 'Vertex Jerseys', 'Comfy Chairs Co.', 'Driftline'],
};
// What a sponsor asks of the club in return (board objective ids, see objectiveMet).
export const SPONSOR_GOALS = {
    1: [
        { id: 'tophalf', text: 'Finish in the top half of the league', tier: 0 },
        { id: 'playoffs1', text: 'Reach the playoffs at least once', tier: 0 },
        { id: 'playoffs2', text: 'Reach the playoffs in Spring and Summer', tier: 1 },
        { id: 'worlds', text: 'Qualify for Worlds', tier: 1 },
        { id: 'title', text: 'Win a domestic title', tier: 2 },
    ],
    2: [
        { id: 'tophalf', text: 'Finish in the top half of the league', tier: 0 },
        { id: 'playoffs1', text: 'Reach the playoffs at least once', tier: 0 },
        { id: 'playoffs2', text: 'Reach the playoffs in Spring and Summer', tier: 1 },
        { id: 'promote', text: 'Win promotion', tier: 2 },
    ],
};

/** The stake one perk point buys in the manager's club (POINT_ACTIONS 'stake'). */
export const STAKE_PER_POINT = 10;
/** Buying a stake back costs this much more than selling it. */
export const BUYBACK_PREMIUM = 1.15;

// ---------------------------------------------------------------- transfers
/** Clubs sell outside a window only once a season, at a premium. */
export const EMERGENCY_PREMIUM = 1.2;
/** Colours a custom club can take. */
export const CLUB_COLORS = [
    '#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#22d3ee', '#84cc16', '#f97316', '#e2e8f0', '#facc15', '#6366f1',
    '#14b8a6', '#dc2626', '#0ea5e9', '#d97706', '#7c3aed', '#db2777', '#06b6d4', '#65a30d', '#ea580c', '#94a3b8', '#eab308', '#4f46e5',
    '#b91c1c', '#1d4ed8', '#047857', '#be185d', '#a16207', '#0f766e', '#c026d3', '#f43f5e', '#78716c', '#1e293b',
];
/**
 * Club emblems (24x24, filled), for random teams and for a club the manager founds.
 * Real orgs keep their tag until real logos are added. Ids are save data.
 */
export const TEAM_EMBLEMS = [
    { id: 'star', name: 'Star', d: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z' },
    { id: 'bolt', name: 'Bolt', d: 'M13 2L4 14h7l-1 8 9-12h-7z' },
    { id: 'crown', name: 'Crown', d: 'M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4zM3 20h18v2H3z' },
    { id: 'flame', name: 'Flame', d: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-4 2.5-5-.2 2 .8 3.5 2 3.8C11 8.5 13 6 12 2z' },
    { id: 'shield', name: 'Shield', d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z' },
    { id: 'diamond', name: 'Diamond', d: 'M12 2l8 10-8 10-8-10z' },
    { id: 'moon', name: 'Moon', d: 'M15 3a9 9 0 1 0 6 15A7.5 7.5 0 0 1 15 3z' },
    { id: 'sun', name: 'Sun', d: 'M12 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10zM11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4z' },
    { id: 'peak', name: 'Peak', d: 'M2 20l7-12 4 6 3-4 6 10z' },
    { id: 'hex', name: 'Hexagon', d: 'M12 2l8.7 5v10L12 22l-8.7-5V7z' },
    { id: 'chevron', name: 'Chevrons', d: 'M4 3l8 6 8-6v4l-8 6-8-6zM4 11l8 6 8-6v4l-8 6-8-6z' },
    { id: 'blade', name: 'Blade', d: 'M14 2h8v8l-9 9 2 2-2 2-3-3-3 3-2-2 3-3-3-3 2-2 2 2z' },
    { id: 'eye', name: 'Eye', d: 'M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
    { id: 'target', name: 'Target', d: 'M12 2a10 10 0 1 1 0 20 10 10 0 1 1 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 1 0 0-12zm0 3a3 3 0 1 1 0 6 3 3 0 1 1 0-6z' },
    { id: 'wave', name: 'Wave', d: 'M2 13c3-4 5-4 7 0s4 4 7 0 4-4 6-2v9H2z' },
    { id: 'paw', name: 'Paw', d: 'M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 11c3 0 6 4 6 7a3 3 0 0 1-3 3c-1 0-2-.6-3-.6s-2 .6-3 .6a3 3 0 0 1-3-3c0-3 3-7 6-7z' },
];
export const TEAM_EMBLEM_BY_ID = Object.fromEntries(TEAM_EMBLEMS.map(e => [e.id, e]));

// ---------------------------------------------------------------- generated clubs
// A region with few real orgs in a year needs up to twenty generated clubs.
export const CLUB_CITIES = {
    LCK: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan', 'Suwon', 'Changwon', 'Jeju', 'Pohang', 'Jeonju', 'Goyang', 'Yongin', 'Sejong', 'Gimhae'],
    LPL: ['Shanghai', 'Beijing', 'Chengdu', 'Wuhan', 'Hangzhou', 'Shenzhen', 'Chongqing', 'Xian', 'Nanjing', 'Suzhou', 'Guangzhou', 'Tianjin', 'Qingdao', 'Harbin', 'Kunming', 'Dalian'],
    LEC: ['Berlin', 'Paris', 'London', 'Madrid', 'Stockholm', 'Warsaw', 'Rome', 'Amsterdam', 'Copenhagen', 'Prague', 'Lisbon', 'Vienna', 'Hamburg', 'Barcelona', 'Milan', 'Oslo', 'Dublin', 'Lyon'],
    LCS: ['Los Angeles', 'New York', 'Chicago', 'Seattle', 'Austin', 'Toronto', 'Miami', 'Boston', 'Denver', 'Atlanta', 'Vancouver', 'Dallas', 'Portland', 'Phoenix', 'Detroit', 'Montreal', 'Houston', 'San Diego'],
    LCP: ['Tokyo', 'Taipei', 'Manila', 'Sydney', 'Saigon', 'Osaka', 'Hong Kong', 'Singapore', 'Jakarta', 'Bangkok', 'Melbourne', 'Hanoi', 'Kuala Lumpur', 'Auckland', 'Kyoto', 'Kaohsiung'],
    CBLOL: ['Rio', 'Sao Paulo', 'Recife', 'Brasilia', 'Salvador', 'Curitiba', 'Fortaleza', 'Manaus', 'Porto Alegre', 'Belo Horizonte', 'Goiania', 'Belem', 'Florianopolis', 'Vitoria', 'Natal', 'Campinas'],
};
export const CLUB_MASCOTS = ['Vipers', 'Ravens', 'Kings', 'Knights', 'Hawks', 'Wolves', 'Titans', 'Comets', 'Storm', 'Phantoms', 'Rangers', 'Sentinels', 'Raiders', 'Legion', 'Apex', 'Vortex', 'Eclipse', 'Nova', 'Pulse', 'Zenith', 'Ember', 'Monarchs', 'Drift', 'Rogues', 'Guardians', 'Strikers', 'Dynamo', 'Spectres', 'Crown', 'Forge'];

// ---------------------------------------------------------------- team talks
export const TALKS = [
    { id: 'praise',    name: 'Praise',      icon: 'star',  blurb: 'Tell them they are playing well. Lands best after a good game.' },
    { id: 'encourage', name: 'Encourage',   icon: 'heart', blurb: 'Pick them up. Best when morale is low.' },
    { id: 'demand',    name: 'Demand more', icon: 'flame', blurb: 'Push them harder. Professionals and Leaders respond; Hotheads do not.' },
];

// ---------------------------------------------------------------- the calendar
// One step at a time. Every region and both tiers move together.
// Thirteen clubs a league: a single round robin is thirteen weeks with one bye each.
// Winter is the short split: the first seven of those rounds, so a club plays six or
// seven series and the table is read on wins minus losses.
export const LEAGUE_WEEKS = 13;
export const WINTER_WEEKS = 7;
export const weeksOf = (split) => (split === 'winter' ? WINTER_WEEKS : LEAGUE_WEEKS);
export const SPLITS = ['winter', 'spring', 'summer'];
export const SPLIT_NAME = { winter: 'Winter', spring: 'Spring', summer: 'Summer' };
/** What a split is called in a club's history rows (`team.sh`), which are save data. */
export const SPLIT_CODE = { winter: 'wi', spring: 'sp', summer: 'su' };
export const SPLIT_BY_CODE = { wi: 'Winter', sp: 'Spring', su: 'Summer' };
/** The step ids of the 33-step year, in order: how a save from before the winter split finds its place. */
export const OLD_CALENDAR = ['preseason', ...Array.from({ length: 9 }, (_, i) => 'spring_w' + (i + 1)), 'spring_sf', 'spring_f', 'msi_qf', 'msi_sf', 'msi_f', 'midseason',
    ...Array.from({ length: 9 }, (_, i) => 'summer_w' + (i + 1)), 'summer_sf', 'summer_f', 'promotion', 'worlds_r16', 'worlds_qf', 'worlds_sf', 'worlds_f', 'offseason'];
function buildCalendar() {
    const out = [{ id: 'preseason', kind: 'window', name: 'Preseason', short: 'Preseason', split: 'winter' }];
    for (let i = 0; i < WINTER_WEEKS; i++) out.push({ id: 'winter_w' + (i + 1), kind: 'league', split: 'winter', md: i, name: `Winter Split · Week ${i + 1}`, short: `Winter W${i + 1}` });
    out.push({ id: 'winter_sf', kind: 'playoffs', split: 'winter', round: 0, name: 'Winter Playoffs · Semifinals', short: 'Winter SF' });
    out.push({ id: 'winter_f', kind: 'playoffs', split: 'winter', round: 1, name: 'Winter Final', short: 'Winter Final' });
    out.push({ id: 'fs_qf', kind: 'intl', event: 'firststand', round: 0, split: 'winter', name: 'First Stand · Quarterfinals', short: 'FS QF' });
    out.push({ id: 'fs_sf', kind: 'intl', event: 'firststand', round: 1, split: 'winter', name: 'First Stand · Semifinals', short: 'FS SF' });
    out.push({ id: 'fs_f', kind: 'intl', event: 'firststand', round: 2, split: 'winter', name: 'First Stand Final', short: 'FS Final' });
    for (let i = 0; i < LEAGUE_WEEKS; i++) out.push({ id: 'spring_w' + (i + 1), kind: 'league', split: 'spring', md: i, name: `Spring Split · Week ${i + 1}`, short: `Spring W${i + 1}` });
    out.push({ id: 'spring_sf', kind: 'playoffs', split: 'spring', round: 0, name: 'Spring Playoffs · Semifinals', short: 'Spring SF' });
    out.push({ id: 'spring_f', kind: 'playoffs', split: 'spring', round: 1, name: 'Spring Final', short: 'Spring Final' });
    out.push({ id: 'msi_qf', kind: 'intl', event: 'msi', round: 0, split: 'spring', name: 'MSI · Quarterfinals', short: 'MSI QF' });
    out.push({ id: 'msi_sf', kind: 'intl', event: 'msi', round: 1, split: 'spring', name: 'MSI · Semifinals', short: 'MSI SF' });
    out.push({ id: 'msi_f', kind: 'intl', event: 'msi', round: 2, split: 'spring', name: 'MSI Final', short: 'MSI Final' });
    out.push({ id: 'midseason', kind: 'window', name: 'Mid-Season Break', short: 'Break', split: 'summer' });
    for (let i = 0; i < LEAGUE_WEEKS; i++) out.push({ id: 'summer_w' + (i + 1), kind: 'league', split: 'summer', md: i, name: `Summer Split · Week ${i + 1}`, short: `Summer W${i + 1}` });
    out.push({ id: 'summer_sf', kind: 'playoffs', split: 'summer', round: 0, name: 'Summer Playoffs · Semifinals', short: 'Summer SF' });
    out.push({ id: 'summer_f', kind: 'playoffs', split: 'summer', round: 1, name: 'Summer Final', short: 'Summer Final' });
    out.push({ id: 'promotion', kind: 'promotion', split: 'summer', name: 'Promotion Series', short: 'Promotion' });
    out.push({ id: 'worlds_r16', kind: 'intl', event: 'worlds', round: 0, split: 'summer', name: 'Worlds · Round of 16', short: 'Worlds R16' });
    out.push({ id: 'worlds_qf', kind: 'intl', event: 'worlds', round: 1, split: 'summer', name: 'Worlds · Quarterfinals', short: 'Worlds QF' });
    out.push({ id: 'worlds_sf', kind: 'intl', event: 'worlds', round: 2, split: 'summer', name: 'Worlds · Semifinals', short: 'Worlds SF' });
    out.push({ id: 'worlds_f', kind: 'intl', event: 'worlds', round: 3, split: 'summer', name: 'Worlds Final', short: 'Worlds Final' });
    out.push({ id: 'offseason', kind: 'offseason', split: 'summer', name: 'Offseason', short: 'Offseason' });
    return out;
}
export const CALENDAR = buildCalendar();
export const STEPS_PER_YEAR = CALENDAR.length;
/** Bumped when the year's steps change; a save below it is moved by migrateCalendar. */
export const CALENDAR_VERSION = 2;
export const STEP_INDEX = Object.fromEntries(CALENDAR.map((s, i) => [s.id, i]));

/** The stages of a year, in order. Moving from one to the next is what the
 *  transition screen announces. */
export const SEASON_PHASES = [
    { id: 'preseason', name: 'Preseason', short: 'Preseason', icon: 'trade', color: '#22d3ee', blurb: 'Transfer window open. Build the roster, set the plan.' },
    { id: 'winter', name: 'Winter Split', short: 'Winter', icon: 'calendar', color: '#7dd3fc', blurb: 'Seven short weeks. The top four make the playoffs.' },
    { id: 'winter_po', name: 'Winter Playoffs', short: 'Playoffs', icon: 'trophy', color: '#fbbf24', blurb: 'Best of five. The champion goes to First Stand.' },
    { id: 'firststand', name: 'First Stand', short: 'First Stand', icon: 'flag', color: '#f472b6', blurb: 'The first international of the year: the winter champions, best of five.' },
    { id: 'spring', name: 'Spring Split', short: 'Spring', icon: 'calendar', color: '#34d399', blurb: 'Thirteen weeks of best-of-three. The top four make the playoffs.' },
    { id: 'spring_po', name: 'Spring Playoffs', short: 'Playoffs', icon: 'trophy', color: '#fbbf24', blurb: 'Best of five. The champion goes to MSI.' },
    { id: 'msi', name: 'Mid-Season Invitational', short: 'MSI', icon: 'globe', color: '#38bdf8', blurb: 'The spring champions of the world, best of five.' },
    { id: 'midseason', name: 'Mid-Season Break', short: 'Break', icon: 'trade', color: '#22d3ee', blurb: 'The second transfer window of the year.' },
    { id: 'summer', name: 'Summer Split', short: 'Summer', icon: 'calendar', color: '#fb923c', blurb: 'Thirteen more weeks. Relegation is decided over the whole year.' },
    { id: 'summer_po', name: 'Summer Playoffs', short: 'Playoffs', icon: 'trophy', color: '#fbbf24', blurb: 'Best of five. The finalists go to Worlds.' },
    { id: 'promotion', name: 'Promotion Series', short: 'Promotion', icon: 'upgrade', color: '#a78bfa', blurb: 'One best-of-five for a place in the top league.' },
    { id: 'worlds', name: 'World Championship', short: 'Worlds', icon: 'crown', color: '#facc15', blurb: 'Sixteen teams. One trophy.' },
    { id: 'offseason', name: 'Offseason', short: 'Offseason', icon: 'moon', color: '#94a3b8', blurb: 'Awards, retirements, rookies and the board\'s verdict.' },
];
export const SEASON_PHASE_BY_ID = Object.fromEntries(SEASON_PHASES.map(p => [p.id, p]));
export function phaseOfStep(step) {
    if (!step) return 'preseason';
    if (step.kind === 'window') return step.id === 'preseason' ? 'preseason' : 'midseason';
    if (step.kind === 'league') return step.split;
    if (step.kind === 'playoffs') return step.split + '_po';
    if (step.kind === 'intl') return step.event;
    return step.kind;      // promotion, offseason
}

export const LEAGUE_BEST_OF = 3;
export const KNOCKOUT_BEST_OF = 5;

// Tier sizes: thirteen clubs in both leagues of every region.
export const TIER1_SIZE = 13;
export const TIER2_SIZE = 13;
export const ROSTER_MIN = 6;
export const ROSTER_MAX = 10;
/** At most two players of a role: a starter and a sub. */
export const ROLE_MAX = 2;

// Championship points, the order every region's Worlds field is filled in after
// the summer champion and runner-up. Placement is the playoff finish where there
// is one, else the regular season rank.
export const CHAMP_POINTS = { 1: 90, 2: 70, 3: 50, 4: 50, 5: 30, 6: 20, 7: 10, 8: 5 };

// Internationals: MSI takes the six spring champions plus the spring runners-up
// of the two strongest regions; Worlds hands out 4/4/3/2/2/1 by region strength.
export const MSI_EXTRA_REGIONS = 2;
export const WORLDS_SLOTS_BY_RANK = [4, 4, 3, 2, 2, 1];

// Prize money, in dollars.
export const PRIZES = {
    league: { 1: 250000, 2: 120000, 3: 60000, 4: 60000 },
    tier2:  { 1: 60000, 2: 30000 },
    firststand: { 1: 300000, 2: 150000, 3: 75000, 4: 75000, 5: 35000 },
    msi:    { 1: 600000, 2: 300000, 3: 150000, 4: 150000, 5: 70000 },
    worlds: { 1: 2000000, 2: 900000, 3: 450000, 4: 450000, 5: 220000, 9: 100000 },
    cup:    { 1: 120000, 2: 50000 },
};
/** A winter title pays this share of a spring or summer one: seven weeks are not thirteen. */
export const WINTER_PRIZE_SHARE = 0.5;
/** The Regional Cup: tier 1 and tier 2 of a region, 16 clubs, a round on these spring weeks (md). */
export const CUP_WEEKS = [2, 5, 8, 11];
export const CUP_SIZE = 16;

// ---------------------------------------------------------------- champion release years
// Champions released in 2013 or later; anything not listed predates 2013. A
// champion is only draftable from its release year on, so a 2013 save never
// sees K'Sante.
export const CHAMP_RELEASE = {
    thresh: 2013, quinn: 2013, zac: 2013, lissandra: 2013, aatrox: 2013, lucian: 2013, jinx: 2013, yasuo: 2013,
    velkoz: 2014, braum: 2014, gnar: 2014, azir: 2014, kalista: 2014, reksai: 2014,
    bard: 2015, ekko: 2015, tahmkench: 2015, kindred: 2015, illaoi: 2015,
    jhin: 2016, aurelionsol: 2016, taliyah: 2016, kled: 2016, ivern: 2016, camille: 2016,
    xayah: 2017, rakan: 2017, kayn: 2017, ornn: 2017, zoe: 2017,
    kaisa: 2018, pyke: 2018, neeko: 2018,
    sylas: 2019, yuumi: 2019, qiyana: 2019, senna: 2019, aphelios: 2019,
    sett: 2020, lillia: 2020, yone: 2020, samira: 2020, seraphine: 2020, rell: 2020,
    viego: 2021, gwen: 2021, akshan: 2021, vex: 2021,
    zeri: 2022, renata: 2022, belveth: 2022, nilah: 2022, ksante: 2022,
    milio: 2023, naafiri: 2023, briar: 2023, hwei: 2023,
    smolder: 2024, aurora: 2024, ambessa: 2024,
    mel: 2025, yunara: 2025, zaahen: 2025,
    locke: 2026,
};
export function champReleased(id, year) {
    return (CHAMP_RELEASE[id] || 2009) <= year;
}
const _champsFor = new Map();
export function champsFor(role, year) {
    const key = role + ':' + year;
    let hit = _champsFor.get(key);
    if (!hit) {
        hit = CHAMPIONS.filter(c => c.roles.includes(role) && champReleased(c.id, year));
        _champsFor.set(key, hit);
    }
    return hit;
}

/** A region that borrows another year's cards is held this far under the mean of
 *  the two strongest regions, so a borrowed, generously rated card year cannot
 *  make it the best league in the world. Regions with their own year are left as
 *  the cards have them. */
export const BORROWED_REGION_GAP = { LCK: 0, LPL: 0, LEC: 2, LCS: 4, LCP: 5, CBLOL: 6 };

// ---------------------------------------------------------------- team names
// Card-database team tags, spelled out per region. A tag whose full name is not
// known for certain is left as the tag rather than guessed.
export const TEAM_NAMES = {
    LCK: {
        T1: 'T1', SKT: 'SK Telecom T1', SKTK: 'SK Telecom T1 K', SKTS: 'SK Telecom T1 S',
        'Gen.G': 'Gen.G', SSG: 'Samsung Galaxy', SSW: 'Samsung White', SSB: 'Samsung Blue',
        HLE: 'Hanwha Life Esports', ROX: 'ROX Tigers', GET: 'GE Tigers',
        DK: 'Dplus KIA', DWG: 'DAMWON Gaming', KT: 'KT Rolster', KTA: 'KT Arrows',
        BFX: 'BNK FearX', FOX: 'FearX', SANDBOX: 'Liiv SANDBOX', NS: 'Nongshim RedForce', Dynamics: 'Team Dynamics',
        DRX: 'DRX', Kingzone: 'Kingzone DragonX', LZ: 'Longzhu Gaming',
        DNS: 'DN Freecs', KDF: 'Kwangdong Freecs', AFS: 'Afreeca Freecs', AF: 'Afreeca Freecs', Afreeca: 'Afreeca Freecs',
        BRO: 'OKSavingsBank BRION', BBQ: 'BBQ Olivers', bbq: 'BBQ Olivers',
        CJ: 'CJ Entus', CJF: 'CJ Entus Frost', CJB: 'CJ Entus Blaze',
        NJ: 'NaJin e-mFire', NJS: 'NaJin Sword', NJB: 'NaJin Black Sword', NJSh: 'NaJin Shield', NWS: 'NaJin White Shield', NBS: 'NaJin Black Sword',
        JAG: 'Jin Air Green Wings', 'Jin Air': 'Jin Air Green Wings', JAF: 'Jin Air Falcons', JAGS: 'Jin Air Stealths',
        IM: 'Incredible Miracle', MVP: 'MVP', ESC: 'ESC Ever', E8: 'Ever8 Winners', Griffin: 'Griffin', SP: 'SeolHaeOne Prince',
        AZF: 'Azubu Frost', AZB: 'Azubu Blaze', XST: 'Xenics Storm',
    },
    LPL: {
        AL: 'Anyone\'s Legend', BLG: 'Bilibili Gaming', EDG: 'EDward Gaming', FPX: 'FunPlus Phoenix', IG: 'Invictus Gaming',
        JDG: 'JD Gaming', LGD: 'LGD Gaming', LNG: 'LNG Esports', NIP: 'Ninjas in Pyjamas', OMG: 'Oh My God',
        RNG: 'Royal Never Give Up', TES: 'Top Esports', TT: 'ThunderTalk Gaming', UP: 'Ultra Prime', WBG: 'Weibo Gaming',
        WE: 'Team WE', EP: 'Energy Pacemaker', GT: 'Game Talents', M3: 'Masters3', SHRC: 'Star Horn Royal Club',
        Snake: 'Snake Esports', VG: 'Vici Gaming', NB: 'Newbee', PE: 'Positive Energy', RC: 'Royal Club', LMQ: 'LMQ',
        EH: 'Ehome', SN: 'Suning', RW: 'Rogue Warriors', TOP: 'Topsports Gaming', DMO: 'Dominus Esports',
        V5: 'Victory Five', eStar: 'eStar Gaming', RA: 'Rare Atom', IM2016: 'I May',
    },
    LEC: {
        G2: 'G2 Esports', KC: 'Karmine Corp', KCB: 'Karmine Corp Blue', NAVI: 'Natus Vincere', VIT: 'Team Vitality', Vitality: 'Team Vitality',
        TH: 'Team Heretics', GX: 'GIANTX', MKOI: 'Movistar KOI', KOI: 'KOI', LR: 'Los Ratones', Shifters: 'Shifters',
        SK: 'SK Gaming', SKG: 'SK Gaming', FNC: 'Fnatic', Fnatic: 'Fnatic', BDS: 'Team BDS', MAD: 'MAD Lions',
        OG: 'Origen', Origen: 'Origen', H2K: 'H2K-Gaming', UOL: 'Unicorns of Love', UoL: 'Unicorns of Love',
        GMB: 'Gambit Gaming', GIA: 'Giants Gaming', Giants: 'Giants Gaming', EL: 'Elements', ROC: 'Team ROCCAT', ROCCAT: 'Team ROCCAT',
        CW: 'Copenhagen Wolves', S04: 'FC Schalke 04', Schalke: 'FC Schalke 04', SPY: 'Splyce', Splyce: 'Splyce',
        LD: 'Lemondogs', EG: 'Evil Geniuses', ALT: 'Alternate', NIP: 'Ninjas in Pyjamas', MYM: 'Meet Your Makers',
        M5: 'Moscow Five', CLGE: 'CLG Europe', ALL: 'Alliance', SHC: 'Supa Hot Crew', MIL: 'Millenium',
        MSF: 'Misfits Gaming', Misfits: 'Misfits Gaming', Rogue: 'Rogue', Excel: 'Excel Esports', Astralis: 'Astralis',
    },
    LCS: {
        C9: 'Cloud9', TL: 'Team Liquid', DIG: 'Dignitas', FLY: 'FlyQuest', LYON: 'LYON', SEN: 'Sentinels',
        SR: 'Shopify Rebellion', DSG: 'Disguised', '100T': '100 Thieves', NRG: 'NRG', CLG: 'Counter Logic Gaming',
        NME: 'Enemy eSports', GV: 'Gravity', T8: 'Team 8', TDK: 'Team Dragon Knights', TIP: 'Team Impulse',
        TSM: 'TSM', IMT: 'Immortals', NV: 'Team EnVyUs', APX: 'Apex Gaming', P1: 'Phoenix1', FOX: 'Echo Fox',
    },
    LCP: {
        CFO: 'CTBC Flying Oyster', DCG: 'Deep Cross Gaming', DFM: 'DetonatioN FocusMe', GAM: 'GAM Esports',
        MVK: 'MVK Esports', TSW: 'Team Secret Whales', CHF: 'Chiefs Esports Club', SHG: 'SoftBank HAWKS gaming',
        PSG: 'PSG Talon', ahq: 'ahq e-Sports Club', HKE: 'Hong Kong Esports', FW: 'Flash Wolves',
        MSE: 'Machi Esports', TPA: 'Taipei Assassins', JT: 'J Team', FE: 'Frank Esports', WPE: 'West Point Esports',
    },
    CBLOL: {
        KBM: 'KaBuM! e-Sports', CNB: 'CNB e-Sports Club', paiN: 'paiN Gaming', KEYD: 'Keyd Stars', INTZ: 'INTZ e-Sports',
        g3X: 'g3nerationX', RED: 'RED Canids', BG: 'Big Gods', ONE: 'ONE Team', PRG: 'ProGaming Esports',
        FLA: 'Flamengo Esports', UPP: 'Uppercut', RDM: 'Redemption eSports', PRD: 'Prodigy Esports', SAN: 'Santos e-Sports',
        FUR: 'FURIA Esports', RNS: 'Rensga Esports', VRX: 'Vorax', LOUD: 'LOUD', MIN: 'Miners', LBR: 'Liberty',
        VKS: 'Vivo Keyd Stars', FX: 'Fluxo', LOS: 'Los Grandes', ISG: 'Isurus Estral', LEV: 'Leviatán', FXW: 'Fluxo W7M',
    },
};
/** Card tags that are the same org under another name, so a debuting player whose
 *  card says SKTK can join the world's SKT. Per region. */
//  Only rebrands and sold spots that are certain; when in doubt a tag stands alone.
export const ORG_GROUPS = {
    LCK: [['T1', 'SKT', 'SKTK', 'SKTS'], ['Gen.G', 'SSG', 'SSW', 'SSB'], ['HLE', 'ROX', 'GET'], ['DK', 'DWG'], ['KT', 'KTA'],
          ['BFX', 'FOX', 'SANDBOX'], ['NS', 'Dynamics'], ['NJ', 'NJS', 'NJB', 'NJSh', 'NWS', 'NBS'], ['DRX', 'Kingzone', 'LZ'],
          ['DNS', 'KDF', 'AFS', 'AF', 'Afreeca'], ['BBQ', 'bbq'], ['CJ', 'CJF', 'CJB'], ['JAG', 'Jin Air', 'JAF', 'JAGS'], ['MVP', 'MVP2016']],
    LPL: [['TES', 'TOP'], ['WBG', 'SN']],
    LEC: [['FNC', 'Fnatic'], ['VIT', 'Vitality'], ['MKOI', 'KOI', 'Rogue'], ['SK', 'SKG'], ['BDS', 'S04', 'Schalke'], ['GX', 'GIA', 'Giants', 'Excel'],
          ['UOL', 'UoL'], ['OG', 'Origen'], ['ROC', 'ROCCAT'], ['SPY', 'Splyce'], ['MSF', 'Misfits'], ['KC', 'KCB']],
    LCS: [['SR', 'TSM']],
    LCP: [],
    CBLOL: [['VKS', 'KEYD'], ['FXW', 'FX']],
};
export function sameOrg(region, a, b) {
    if (a === b) return true;
    for (const g of ORG_GROUPS[region] || []) if (g.includes(a) && g.includes(b)) return true;
    return false;
}

// Team colours, keyed by any tag of a known org. Everything else gets a stable
// colour from its name.
export const TEAM_COLORS = {
    T1: '#e2012d', SKT: '#e2012d', SKTK: '#e2012d', SKTS: '#e2012d', 'Gen.G': '#aa8a00', SSG: '#1f4fbf', SSW: '#cbd5e1', SSB: '#2563eb',
    HLE: '#ff6b01', ROX: '#f59e0b', DK: '#0f6f4c', DWG: '#0f6f4c', KT: '#ff0a0a', KTA: '#ff0a0a', BFX: '#00b2a9', SANDBOX: '#facc15',
    NS: '#d31145', DRX: '#5383e8', Kingzone: '#5383e8', LZ: '#5383e8', DNS: '#0b6cb8', KDF: '#0b6cb8', AFS: '#0b6cb8', AF: '#0b6cb8', Afreeca: '#0b6cb8',
    BRO: '#00a3e0', CJF: '#7dd3fc', CJB: '#2563eb', CJ: '#2563eb', NJS: '#9ca3af', NJB: '#111827', JAF: '#22c55e', JAG: '#22c55e', MVP: '#f97316',
    BLG: '#1e5bc6', JDG: '#c8102e', TES: '#e60012', WBG: '#d7000f', LNG: '#00a0e9', AL: '#f5a800', IG: '#7aa2c9', EDG: '#94a3b8',
    FPX: '#e4002b', OMG: '#ff6600', RNG: '#d4a017', WE: '#ffd400', LGD: '#e0b100', RC: '#d4a017', PE: '#f43f5e', SN: '#f59e0b', VG: '#f97316',
    G2: '#ee3a43', FNC: '#ff5900', Fnatic: '#ff5900', MKOI: '#8a2be2', KOI: '#8a2be2', TH: '#ffcc00', BDS: '#e4002b', VIT: '#ffdd00', Vitality: '#ffdd00',
    KC: '#00b2ff', KCB: '#00b2ff', SK: '#3b82f6', SKG: '#3b82f6', GX: '#f26522', NAVI: '#ffe600', MAD: '#d4a017', GMB: '#dc2626', MSF: '#ef4444', Misfits: '#ef4444',
    H2K: '#f8fafc', OG: '#22c55e', Origen: '#22c55e', UOL: '#ec4899', UoL: '#ec4899', SPY: '#f59e0b', Splyce: '#f59e0b', Rogue: '#3b82f6', Excel: '#1e3a8a',
    C9: '#00a8e0', TL: '#4f7cff', FLY: '#3bb143', '100T': '#e4002b', NRG: '#ef4444', SR: '#95bf47', TSM: '#e5e7eb', DIG: '#ffcc00', LYON: '#ff4d6d', DSG: '#7c3aed', IMT: '#00a1e0', CLG: '#2563eb', SEN: '#ef4444',
    CFO: '#00a9a5', PSG: '#e30613', GAM: '#f5a800', TSW: '#00b2ff', DFM: '#e60012', MVK: '#1f4e79', SHG: '#f5a800', DCG: '#0a1e3c', FW: '#f59e0b', ahq: '#ef4444',
    LOUD: '#00e701', LOS: '#fbbf24', FUR: '#e5e7eb', VKS: '#8b5cf6', KEYD: '#8b5cf6', RED: '#d10a11', paiN: '#e4002b', FXW: '#1e6bff', FX: '#1e6bff', LEV: '#0abfbc', KBM: '#ff6a00', INTZ: '#e11d48', CNB: '#16a34a', FLA: '#dc2626',
};

// ---------------------------------------------------------------- random players
// Handles for generated players. Region-flavoured, never a real pro's name (the
// generator checks against the card database before using one).
export const HANDLE_WORDS = [
    'Nova', 'Rift', 'Echo', 'Kairo', 'Vanta', 'Lumen', 'Pulse', 'Drift', 'Ember', 'Frost', 'Halo', 'Ion', 'Jolt', 'Kite',
    'Lynx', 'Mirage', 'Nimbus', 'Orbit', 'Prism', 'Quill', 'Rune', 'Sable', 'Talon', 'Umbra', 'Vigil', 'Wisp', 'Zenith',
    'Arc', 'Blitzer', 'Cinder', 'Dusk', 'Flux', 'Gale', 'Hex', 'Iris', 'Jade', 'Koda', 'Lark', 'Mako', 'Noir', 'Onyx',
    'Pike', 'Quasar', 'Raze', 'Spire', 'Tempo', 'Vex', 'Warden', 'Yuki', 'Zephyr', 'Aster', 'Bolt', 'Comet', 'Dash',
    'Flare', 'Glint', 'Haze', 'Inferno', 'Karma', 'Loom', 'Moth', 'Neon', 'Opal', 'Rook', 'Shard', 'Thorn', 'Volt',
    'Wraith', 'Axiom', 'Cypher', 'Delta', 'Fable', 'Ghosty', 'Hydra', 'Juno', 'Kestrel', 'Mantis', 'Nyx', 'Oracle',
    'Phantom', 'Raven', 'Sigil', 'Tundra', 'Valor', 'Wick', 'Xeno', 'Yarrow', 'Zest', 'Briar', 'Coda', 'Ferro', 'Grit',
];
export const HANDLE_REGIONAL = {
    LCK: ['Haneul', 'Doyun', 'Seojun', 'Minho', 'Jiho', 'Taeyang', 'Byul', 'Gureum', 'Baram', 'Sora', 'Dalbit', 'Hwarang', 'Yeon', 'Kkot', 'Pado', 'Nabi', 'Hoon', 'Sejin', 'Bitna', 'Onyu'],
    LPL: ['Xiaoyu', 'Leyan', 'Haotian', 'Mingxuan', 'Zihan', 'Feiyu', 'Yunze', 'Chenxi', 'Longwei', 'Jiale', 'Ruoxi', 'Tianyi', 'Shuyang', 'Qingfeng', 'Bowen', 'Yichen', 'Hanyu', 'Kexin', 'Zhiyuan', 'Muchen'],
    LEC: ['Kaspar', 'Lukas', 'Mateo', 'Elias', 'Nikolai', 'Bastien', 'Oskar', 'Viggo', 'Tomas', 'Henrik', 'Dario', 'Jonas', 'Mirek', 'Anton', 'Leander', 'Felix', 'Soren', 'Raul', 'Kuba', 'Emil'],
    LCS: ['Brody', 'Tanner', 'Colt', 'Mason', 'Ryder', 'Jaxon', 'Wyatt', 'Hunter', 'Cash', 'Dallas', 'Beckett', 'Rowan', 'Gage', 'Knox', 'Easton', 'Reid', 'Sawyer', 'Tate', 'Brennan', 'Holt'],
    LCP: ['Kenta', 'Haruto', 'Minh', 'Rizal', 'Kaito', 'Arjun', 'Tuan', 'Bayu', 'Sora', 'Riku', 'Anh', 'Kiet', 'Daiki', 'Ren', 'Yuto', 'Ilham', 'Paolo', 'Jun', 'Hiro', 'Bao'],
    CBLOL: ['Tatu', 'Brasa', 'Caju', 'Jabuti', 'Saci', 'Boto', 'Pipoca', 'Faisca', 'Raio', 'Trovao', 'Guri', 'Moleque', 'Pitbull', 'Coruja', 'Tucano', 'Onca', 'Vento', 'Fumaca', 'Lampiao', 'Mandacaru'],
};
export const HANDLE_SUFFIX = ['', '', '', '', '', 'x', 'z', 'o', 'y', 'ie', 'er', '7', '99', 'XD', 'jr'];
// Generated players' ceilings: above HIGH_POT a potential is squeezed (x HIGH_POT_SQUEEZE of the
// excess) unless the player rolled as a wonderkid (WONDERKID_CHANCE, 20 and under).
export const HIGH_POT = 86;
export const HIGH_POT_SQUEEZE = 0.35;
export const WONDERKID_CHANCE = 0.025;
// The ceiling clubs scout free agency for (youth academies most of all).
export const ELITE_PROSPECT = 88;
// More words, and syllables the generator joins into new handles (Kazaro, Velix, Shiren...).
export const HANDLE_WORDS_EXTRA = [
    'Abyss', 'Blaze', 'Crux', 'Dagger', 'Envy', 'Fang', 'Glacier', 'Harbor', 'Icarus', 'Jinxed', 'Kraken', 'Lotus',
    'Maverick', 'Nomad', 'Outlaw', 'Pilot', 'Quartz', 'Ronin', 'Saber', 'Tiger', 'Unity', 'Viper', 'Whisper', 'Yeti',
    'Anchor', 'Bishop', 'Caster', 'Dynamo', 'Eclipse', 'Falcon', 'Golem', 'Hermit', 'Indigo', 'Jester', 'Kodiak',
    'Lancer', 'Monk', 'Nebula', 'Omen', 'Paladin', 'Ripple', 'Scout', 'Titan', 'Vortex', 'Wolfie', 'Zero', 'Atlas',
    'Breeze', 'Cobalt', 'Domino', 'Ether', 'Fizzy', 'Granite', 'Hollow', 'Ivory', 'Kumo', 'Mochi', 'Pebble', 'Sonic',
];
export const HANDLE_SYL_START = ['Ka', 'Ze', 'Ry', 'Mo', 'Ta', 'Vi', 'Lu', 'No', 'Shi', 'Ar', 'El', 'Gra', 'Dra', 'Fen', 'Ko', 'Sy', 'Xa', 'Qui', 'Ba', 'Tor', 'Yu', 'Ha', 'Ri', 'Ve', 'Za', 'Mi', 'Jo', 'Ky', 'Pa', 'Sa'];
export const HANDLE_SYL_MID = ['', '', 'ra', 'li', 'ne', 'ko', 'va', 'mi', 'ze', 'ro', 'ta', 'ki'];
export const HANDLE_SYL_END = ['ro', 'x', 'n', 'ra', 'ki', 'th', 'vo', 'zy', 'mi', 'ux', 'or', 'en', 'is', 'ka', 'el', 'on', 'ix', 'us', 'ar', 'yn'];
// Where a generated player of each league comes from: [country code, weight, country name].
export const NATIONS_BY_REGION = {
    LCK: [['KR', 100, 'South Korea']],
    LPL: [['CN', 88, 'China'], ['KR', 9, 'South Korea'], ['TW', 3, 'Taiwan']],
    LEC: [['DE', 14, 'Germany'], ['FR', 14, 'France'], ['ES', 12, 'Spain'], ['PL', 10, 'Poland'], ['DK', 10, 'Denmark'], ['SE', 8, 'Sweden'], ['GB', 7, 'United Kingdom'], ['CZ', 5, 'Czechia'], ['BE', 5, 'Belgium'], ['NL', 4, 'Netherlands'], ['GR', 3, 'Greece'], ['SI', 3, 'Slovenia'], ['TR', 4, 'Turkey'], ['IT', 3, 'Italy'], ['PT', 3, 'Portugal']],
    LCS: [['US', 70, 'United States'], ['CA', 15, 'Canada'], ['KR', 8, 'South Korea'], ['DK', 3, 'Denmark'], ['MX', 4, 'Mexico']],
    LCP: [['VN', 30, 'Vietnam'], ['TW', 22, 'Taiwan'], ['JP', 20, 'Japan'], ['PH', 9, 'Philippines'], ['TH', 7, 'Thailand'], ['AU', 7, 'Australia'], ['HK', 5, 'Hong Kong']],
    CBLOL: [['BR', 100, 'Brazil']],
};
export const COUNTRY_NAME = Object.fromEntries(Object.values(NATIONS_BY_REGION).flat().map(([c, , n]) => [c, n]));
/** A flag emoji from a two-letter country code. */
export function flagOf(cc) {
    return /^[A-Z]{2}$/.test(String(cc || '')) ? String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : null;
}

/** A stable colour for anything without a brand colour. */
export function colorFromName(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 62% 56%)`;
}
