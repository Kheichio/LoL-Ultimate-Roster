// ═══════════════════════════════════════════════════════════════════════════
//  LoL ULTIMATE CAREER — shared constants
// ═══════════════════════════════════════════════════════════════════════════
//  Pure data only. No imports, no state, no DOM. Every other career module
//  reads its numbers from here so a balance change happens in exactly one
//  place. Emoji are written as \u escapes on purpose — this repo has been
//  bitten by encoding corruption when files are rewritten by tooling.

export const CAREER_SAVE_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────
//  ATTRIBUTES
//  Eight trainable attributes. Each one owns exactly one training minigame,
//  so "train mechanics" and "play the Last Hit drill" are the same action.
// ─────────────────────────────────────────────────────────────────────────
export const ATTRS = [
    {
        key: 'mec', name: 'Mechanics', abbr: 'MEC', color: '#ef4444', game: 'combo',
        desc: 'Raw hands. Last-hitting under pressure, combo execution, dodging skillshots.',
    },
    {
        key: 'lne', name: 'Laning', abbr: 'LNE', color: '#f59e0b', game: 'wave',
        desc: 'Wave management, trading patterns, freeze and crash timings, matchup prep.',
    },
    {
        key: 'map', name: 'Map Awareness', abbr: 'MAP', color: '#10b981', game: 'ward',
        desc: 'Vision, tracking the enemy jungler, knowing where five people are without looking.',
    },
    {
        key: 'tmf', name: 'Teamfighting', abbr: 'TMF', color: '#3b82f6', game: 'focus',
        desc: 'Target selection, positioning, cooldown discipline when everything happens at once.',
    },
    {
        key: 'cmp', name: 'Composure', abbr: 'CMP', color: '#a855f7', game: 'clutch',
        desc: 'Tilt resistance. Playing the same on game five of a Bo5 as you did on game one.',
    },
    {
        key: 'ldr', name: 'Shotcalling', abbr: 'LDR', color: '#ec4899', game: 'shotcall',
        desc: 'Macro voice. Objective priority, timers, and getting four other people to listen.',
    },
    {
        key: 'chp', name: 'Champion Pool', abbr: 'CHP', color: '#14b8a6', game: 'pool',
        desc: 'Breadth. How many picks you can be trusted on when the draft goes sideways.',
    },
    {
        key: 'knw', name: 'Game Knowledge', abbr: 'KNW', color: '#94a3b8', game: 'knowledge',
        desc: 'Patch literacy, item math, powerspikes, and what the meta is about to become.',
    },
];

export const ATTR_KEYS = ATTRS.map(a => a.key);
export const ATTR_BY_KEY = ATTRS.reduce((m, a) => { m[a.key] = a; return m; }, {});

// Hard ceiling for any single attribute. 99 keeps career players on the same
// scale as the roster card database.
export const ATTR_MAX = 99;
export const ATTR_MIN = 1;

// ─────────────────────────────────────────────────────────────────────────
//  ROLES
//  weights sum to exactly 1.00 — see ratings.calcOVR(). They encode what the
//  role actually cares about: an ADC lives and dies on MEC/TMF, a support's
//  mechanics barely move their rating.
// ─────────────────────────────────────────────────────────────────────────
export const ROLES = [
    {
        id: 'TOP', name: 'Top Lane', short: 'Top', icon: '/icons/Top_icon.png', accent: '#f97316',
        blurb: 'An island. Win the matchup alone, then decide whether the rest of the map deserves your teleport.',
        weights: { lne: 0.22, mec: 0.18, tmf: 0.16, cmp: 0.14, chp: 0.12, map: 0.08, knw: 0.06, ldr: 0.04 },
    },
    {
        id: 'JNG', name: 'Jungle', short: 'Jungle', icon: '/icons/Jungle_icon.png', accent: '#22c55e',
        blurb: 'Four lanes are yours to lose. Pathing, timers and the loudest voice in the comms.',
        weights: { map: 0.22, ldr: 0.18, mec: 0.14, tmf: 0.14, knw: 0.12, chp: 0.10, cmp: 0.08, lne: 0.02 },
    },
    {
        id: 'MID', name: 'Mid Lane', short: 'Mid', icon: '/icons/Middle_icon.png', accent: '#3b82f6',
        blurb: 'The shortest lane and the shortest leash. Everything you do echoes across the whole map.',
        weights: { mec: 0.22, lne: 0.18, tmf: 0.15, chp: 0.13, map: 0.12, cmp: 0.10, knw: 0.06, ldr: 0.04 },
    },
    {
        id: 'ADC', name: 'Bot Lane', short: 'ADC', icon: '/icons/Bottom_icon.png', accent: '#eab308',
        blurb: 'The damage. No excuses, no forgiveness, and a hundred people watching your positioning.',
        weights: { mec: 0.26, tmf: 0.22, lne: 0.16, cmp: 0.12, chp: 0.10, map: 0.07, knw: 0.04, ldr: 0.03 },
    },
    {
        id: 'SUP', name: 'Support', short: 'Support', icon: '/icons/Support_icon.png', accent: '#a855f7',
        blurb: 'You see the game before it happens. Vision, engages, and the calm the other four borrow.',
        weights: { map: 0.22, tmf: 0.18, ldr: 0.16, cmp: 0.12, lne: 0.10, knw: 0.10, chp: 0.08, mec: 0.04 },
    },
];

export const ROLE_IDS = ROLES.map(r => r.id);
export const ROLE_BY_ID = ROLES.reduce((m, r) => { m[r.id] = r; return m; }, {});

// ─────────────────────────────────────────────────────────────────────────
//  REGIONS
//  Each region trades something away. There is no strictly-best pick: Korea
//  builds fundamentals but caps your creativity, NA pays the most but the
//  league is soft so scouts discount your results.
// ─────────────────────────────────────────────────────────────────────────
export const REGIONS = [
    {
        id: 'LCK', name: 'Korea', league: 'LCK', flag: '\u{1F1F0}\u{1F1F7}', accent: '#3b82f6',
        blurb: 'The most disciplined scene on earth. Brutal solo queue, obsessive fundamentals, no patience for sloppy play.',
        mods: { lne: 4, cmp: 3, knw: 2, mec: 1, ldr: -1, chp: -3, map: 0, tmf: -1 },
        difficulty: 1.15, salaryMult: 1.05, hypeMult: 0.9, scoutMult: 1.10,
        trainingMult: 1.10, regularBestOf: 3,
    },
    {
        id: 'LPL', name: 'China', league: 'LPL', flag: '\u{1F1E8}\u{1F1F3}', accent: '#ef4444',
        blurb: 'Chaos as a system. Every lane fights on cooldown and the highest mechanical ceiling in the world lives here.',
        mods: { mec: 5, tmf: 4, chp: 1, cmp: -4, map: -1, lne: 0, knw: -1, ldr: 0 },
        difficulty: 1.15, salaryMult: 1.20, hypeMult: 1.0, scoutMult: 1.05,
        trainingMult: 1.05, regularBestOf: 3,
    },
    {
        id: 'LEC', name: 'Europe', league: 'LEC', flag: '\u{1F1EA}\u{1F1FA}', accent: '#22d3ee',
        blurb: 'Draft-first, personality-first. Weird picks win here, and the region exports more shotcallers than any other.',
        mods: { chp: 4, ldr: 3, knw: 2, mec: -2, lne: -1, cmp: 0, map: 1, tmf: -2 },
        difficulty: 1.00, salaryMult: 1.00, hypeMult: 1.15, scoutMult: 1.00,
        trainingMult: 1.00, regularBestOf: 1,
    },
    {
        id: 'LCS', name: 'North America', league: 'LCS', flag: '\u{1F1FA}\u{1F1F8}', accent: '#f59e0b',
        blurb: 'The money is real and so is the content. The league is softer, so international results count double for your reputation.',
        mods: { tmf: 2, cmp: 2, knw: 1, chp: 1, lne: -3, map: -1, mec: -1, ldr: 0 },
        difficulty: 0.88, salaryMult: 1.30, hypeMult: 1.25, scoutMult: 0.90,
        trainingMult: 0.92, regularBestOf: 1,
    },
    {
        id: 'LCP', name: 'Asia-Pacific', league: 'LCP', flag: '\u{1F30F}', accent: '#14b8a6',
        blurb: 'The underdog circuit. Smaller salaries, faster promotions, and a real path to a starting seat before you turn seventeen.',
        mods: { map: 3, ldr: 2, tmf: 1, chp: 1, mec: -2, knw: -1, lne: 0, cmp: 0 },
        difficulty: 0.82, salaryMult: 0.75, hypeMult: 0.85, scoutMult: 1.20,
        trainingMult: 0.96, regularBestOf: 3,
    },
    {
        id: 'CBLOL', name: 'Brazil', league: 'CBLOL', flag: '\u{1F1E7}\u{1F1F7}', accent: '#22c55e',
        blurb: 'The loudest crowd in the world and the smallest cheque. Fights start on cooldown, the arena sells out, and almost nobody outside the country is watching.',
        // The trade here is MONEY, and only money. Brazil pays the worst wages in
        // the mode and fields its weakest clubs, so a title comes cheap and
        // everything gold buys comes slowly. trainingMult deliberately sits WITH
        // the LCP's 0.96 rather than below it: gold is what buys a training rig,
        // so a wage floor already taxes training once, and charging it twice made
        // this region close to strictly-worst rather than a trade.
        //
        // Note when tuning: hypeMult is nearly inert (both readers of hype are
        // hard-capped and every region saturates them), scoutMult is read off the
        // HIRING club's region rather than the player's, and difficulty is not
        // read by any game logic at all -- it only draws a bar in the creator.
        // None of the three can carry a region's compensation.
        mods: { tmf: 4, chp: 3, mec: 2, ldr: 1, cmp: -2, map: -2, knw: -1, lne: 0 },
        difficulty: 0.78, salaryMult: 0.68, hypeMult: 1.35, scoutMult: 1.12,
        trainingMult: 0.96, regularBestOf: 1,
    },
];

export const REGION_IDS = REGIONS.map(r => r.id);
export const REGION_BY_ID = REGIONS.reduce((m, r) => { m[r.id] = r; return m; }, {});

/**
 * The regular-season match format of a region's league, which is a real and
 * visible difference between them: Korea, China and the Pacific play Bo3 every
 * week, Europe, NA and Brazil play Bo1.
 *
 * TIER 3 IS ALWAYS Bo1. The amateur circuit is scrims — a Bo3 there would be
 * three games of consequence-free practice, and the tier exists precisely
 * because it has no consequences.
 *
 * A series is still ONE row in the league table, win or lose, exactly like the
 * real leagues score it. Anything reading a fixture for a games count must read
 * `score`, never the row itself.
 */
export function regularBestOf(regionId, tier) {
    if (Math.round(Number(tier) || 1) >= 3) return 1;
    const bo = Math.round(Number((REGION_BY_ID[regionId] || {}).regularBestOf) || 1);
    return bo >= 3 ? 3 : 1;
}

// -------------------------------------------------------------------------
//  LANGUAGES
//  Six regions, four working languages, and THREE OF THEM SHARE ENGLISH ON
//  PURPOSE. The asymmetry is the whole mechanic: a European takes an LCS or an
//  LCP offer with nothing to learn, a Korean has to study English to move west
//  at all, and a European has to study Korean to ever play in the LCK. One
//  language per region would have priced every move identically and made the
//  system a tax rather than a decision.
//
//  Levels are 0..100 and FRACTIONAL for the same reason player.attrs are:
//  immersion moves them in tenths, so rounding on write or on save-load stalls
//  a language short of the band it earned. Round at display time only.
//
//  Language ids are persisted save data exactly like champion and trait ids --
//  never rename or delete one.
// -------------------------------------------------------------------------
export const LANGUAGES = [
    { id: 'en', name: 'English',    accent: '#3b82f6', blurb: 'What the west runs on. Three of the six leagues hold their reviews and their comms in it.' },
    { id: 'ko', name: 'Korean',     accent: '#ef4444', blurb: 'The LCK does not translate for you. Every VOD review, every call and every solo queue lobby is in Korean.' },
    { id: 'zh', name: 'Mandarin',   accent: '#f59e0b', blurb: 'The LPL pays the best wages in the world and expects you to arrive able to talk to your jungler.' },
    { id: 'pt', name: 'Portuguese', accent: '#22c55e', blurb: 'The loudest crowd on earth, and almost none of it happens in English.' },
];
export const LANGUAGE_BY_ID = Object.fromEntries(LANGUAGES.map(l => [l.id, l]));
export const LANGUAGE_IDS = LANGUAGES.map(l => l.id);

/** Region -> the language its league actually works in. Every REGION_IDS entry
 *  must appear here: a missing one makes languageForRegion() return null, and a
 *  null need is read everywhere as "no language required", so that region would
 *  silently become free to sign for from anywhere. */
export const REGION_LANGUAGE = {
    LCK: 'ko', LPL: 'zh', LEC: 'en', LCS: 'en', LCP: 'en', CBLOL: 'pt',
};

// The numbers below are all sized against the curve in languageStudyGain(): a
// lesson at level 0 is worth LANGUAGE_STUDY_BASE and the return shrinks as the
// level rises, which puts the walk at roughly 6 lessons to LANGUAGE_SIGN_MIN,
// 14 to LANGUAGE_FLUENT and 25 to 100. One lesson is one weekly activity slot.

/** Languages share the 0..100 scale of every other visible meter in the mode,
 *  so a bar, a percentage and a band need no conversion anywhere in the UI. */
export const LANGUAGE_MAX = 100;
/** The level that reads as "fluent" and pays the full interest refund. 70 and
 *  not 100 because a career that has to max a language before a foreign club
 *  will pay properly for it is a career that never leaves home. */
export const LANGUAGE_FLUENT = 70;
/** Hard gate: below this a club in that language will not sign you at all. 40
 *  is about six lessons, i.e. two committed weeks -- long enough to be a real
 *  decision, short enough that a move is never a season-long project. */
export const LANGUAGE_SIGN_MIN = 40;
/** Points from one lesson at level 0. */
export const LANGUAGE_STUDY_BASE = 9;
/** The study curve never drops below this multiplier. Without a floor the tail
 *  is asymptotic and 100 is unreachable, which would make the Native band data
 *  that no save can ever display. */
export const LANGUAGE_STUDY_FLOOR = 0.28;
/** Passive weekly gain from living in the region, scaled by the room left. 1.1
 *  puts an existing foreign signing at LANGUAGE_SIGN_MIN in about 46 weeks and
 *  fluent in about 110 -- a season and change, then three years. Living
 *  somewhere converges on its own without ever beating a tutor. */
export const LANGUAGE_IMMERSION_WEEKLY = 1.1;
/** Crash course before you fly out, added by contracts.acceptOffer(). One
 *  lesson's worth: it softens the arrival, it never clears the gate for you. */
export const LANGUAGE_ARRIVAL_BOOST = 8;
/** At or under this age you learn faster. 17 is the age MIN_AGE_INTERNATIONAL
 *  first lets a player leave the region, so the bonus covers exactly the years
 *  a prospect spends preparing to move rather than arriving after the fact. */
export const LANGUAGE_YOUTH_AGE = 17;
export const LANGUAGE_YOUTH_MULT = 1.25;
/** The share of contracts.js's FOREIGN_REGION_PENALTY (-14) that fluency buys
 *  back, so a foreign club's interest runs -14 at nothing and -4.2 at fluent.
 *  Deliberately under 1: an import slot still has to be worth spending, even on
 *  somebody who can talk to the room. */
export const LANGUAGE_INTEREST_REFUND = 0.7;

/** Display bands, highest first -- languageBand() walks them in order, so the
 *  `at: 0` row is the terminator and must stay last. The 70 row is deliberately
 *  LANGUAGE_FLUENT: the label a player reads and the level the refund pays on
 *  are the same statement, and a band that said "Fluent" at a level the economy
 *  did not treat as fluent would be a lie with no symptom. */
export const LANGUAGE_BANDS = [
    { at: 95, label: 'Native' },
    { at: 70, label: 'Fluent' },
    { at: 45, label: 'Conversational' },
    { at: 20, label: 'Basic' },
    { at: 1,  label: 'A few words' },
    { at: 0,  label: 'None' },
];

/** The language a region's clubs work in, or null when there is none to learn.
 *  'ALL' (the amateur circuit) and any unknown id land here, and null is read
 *  everywhere as "no gate", which is what keeps the compulsory first-club
 *  ladder open to a thirteen-year-old who speaks one language. */
export function languageForRegion(regionId) {
    const key = typeof regionId === 'string' ? regionId : '';
    const lang = REGION_LANGUAGE[key];
    return LANGUAGE_IDS.indexOf(lang) >= 0 ? lang : null;
}

/** A career's level in one language, 0..100 and fractional. Returns 0 for an
 *  unknown id and for every shape a rotted save can put in `languages` -- null,
 *  an array, a string, a NaN. */
export function languageLevelFor(c, langId) {
    if (LANGUAGE_IDS.indexOf(langId) < 0) return 0;
    const map = c && c.player && c.player.languages;
    if (!map || typeof map !== 'object') return 0;
    const v = Number(map[langId]);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(LANGUAGE_MAX, v));
}

/** The label for a level. Never returns undefined: the `at: 0` row catches
 *  every number, and a non-number is read as 0. */
export function languageBand(v) {
    const n = Number(v);
    const lvl = Number.isFinite(n) ? Math.max(0, Math.min(LANGUAGE_MAX, n)) : 0;
    for (const b of LANGUAGE_BANDS) if (lvl >= b.at) return b.label;
    return LANGUAGE_BANDS[LANGUAGE_BANDS.length - 1].label;
}

/** 0..1 fluency in a region's language, where 1 is LANGUAGE_FLUENT or better.
 *  A region that needs no language returns 1, so a caller multiplying by this
 *  never has to special-case the amateur circuit. */
export function fluencyForRegion(c, regionId) {
    const need = languageForRegion(regionId);
    if (!need) return 1;
    return Math.max(0, Math.min(1, languageLevelFor(c, need) / LANGUAGE_FLUENT));
}

/** Whether a club in this region could sign you at all. True when the region
 *  needs no language -- see languageForRegion(). */
export function speaksForRegion(c, regionId) {
    const need = languageForRegion(regionId);
    if (!need) return true;
    return languageLevelFor(c, need) >= LANGUAGE_SIGN_MIN;
}

/** The languages still worth studying: everything under LANGUAGE_FLUENT, in
 *  LANGUAGES order. A language above the line is finished as far as the default
 *  target is concerned, though a player may still push it to 100 by hand. */
export function languagesToLearn(c) {
    return LANGUAGES.filter(l => languageLevelFor(c, l.id) < LANGUAGE_FLUENT);
}

/**
 * Which language a lesson would go into. The player's own pick wins while it is
 * a real id that is not already maxed; otherwise the default is the one they
 * have the MOST of, because finishing a language is what clears a gate and
 * three half-learned ones clear nothing.
 *
 * Ties break on LANGUAGE_IDS order, which is why the loop compares strictly.
 * Null only when every language is already at LANGUAGE_FLUENT or above -- the
 * 'language' activity gates on exactly that.
 *
 * A hoisted `function` declaration on purpose: the ACTIVITIES row below names
 * it inside its `when` gate, and ACTIVITIES is built at module load.
 */
export function studyTargetFor(c) {
    const cur = c && c.player && c.player.studyLang;
    if (LANGUAGE_IDS.indexOf(cur) >= 0 && languageLevelFor(c, cur) < LANGUAGE_MAX) return cur;
    let best = null;
    let bestLvl = -1;
    for (const l of languagesToLearn(c)) {
        const lvl = languageLevelFor(c, l.id);
        if (lvl > bestLvl) { bestLvl = lvl; best = l.id; }
    }
    return best;
}

/** The fractional points one lesson adds. Three terms: the room left (the
 *  curve), youth, and KNW -- a player whose whole job is reading patch notes
 *  picks up a language a little faster. KNW is a 0.9x..1.2x band rather than a
 *  bonus so a low-KNW support is slowed, not stopped. Returns 0 for an unknown
 *  id, which is the caller's signal that there was nothing to study. */
export function languageStudyGain(c, langId) {
    if (LANGUAGE_IDS.indexOf(langId) < 0) return 0;
    // Read through `|| {}` rather than a && chain: on a null career the chain
    // yields null, Number(null) is 0, and a missing age would have quietly
    // bought the youth bonus.
    const p = (c && c.player) || {};
    const level = languageLevelFor(c, langId);
    const room = Math.max(LANGUAGE_STUDY_FLOOR, Math.min(1, 1 - level / LANGUAGE_MAX));
    const age = Number(p.age);
    const youth = Number.isFinite(age) && age <= LANGUAGE_YOUTH_AGE ? LANGUAGE_YOUTH_MULT : 1;
    const knwRaw = Number((p.attrs || {}).knw);
    const knw = Number.isFinite(knwRaw) ? Math.max(0, Math.min(99, knwRaw)) : 0;
    return LANGUAGE_STUDY_BASE * room * youth * (0.9 + knw / 99 * 0.3);
}

// ─────────────────────────────────────────────────────────────────────────
//  PLAYSTYLES
//  Four per role. `mods` shift your starting attributes, `growth` multiplies
//  training gains for life, and `bias` is read by the match engine when it
//  scores your in-game decisions (an Engage support who plays passively is
//  playing against their own identity and gets less out of it).
// ─────────────────────────────────────────────────────────────────────────
export const PLAYSTYLES = {
    TOP: [
        {
            id: 'top_carry', name: 'Carry Top', blurb: 'Fiora, Camille, Jax. You are the win condition and you would like everyone to know it.',
            mods: { mec: 4, lne: 2, tmf: -2, cmp: -1 },
            growth: { mec: 1.15, lne: 1.05, tmf: 0.92 },
            bias: { aggression: 0.72, risk: 0.70, teamplay: 0.30 },
        },
        {
            id: 'top_weakside', name: 'Weakside Specialist', blurb: 'Nobody is coming to help and that is fine. Survive, scale, be useful at 25 minutes.',
            mods: { cmp: 4, knw: 3, map: 2, mec: -3, tmf: -1 },
            growth: { cmp: 1.15, knw: 1.10, mec: 0.90 },
            bias: { aggression: 0.20, risk: 0.18, teamplay: 0.80 },
        },
        {
            id: 'top_frontline', name: 'Frontline Tank', blurb: 'Ornn, K’Sante, Sion. You start every fight and you finish standing in the middle of it.',
            mods: { tmf: 5, cmp: 2, ldr: 1, mec: -3, lne: -2 },
            growth: { tmf: 1.18, cmp: 1.05, mec: 0.88 },
            bias: { aggression: 0.45, risk: 0.35, teamplay: 0.92 },
        },
        {
            id: 'top_split', name: 'Split Pusher', blurb: 'The map is a spreadsheet and you are always in the highest-value cell. Usually alone.',
            mods: { lne: 4, map: 3, mec: 1, tmf: -4, ldr: -1 },
            growth: { lne: 1.12, map: 1.12, tmf: 0.88 },
            bias: { aggression: 0.62, risk: 0.60, teamplay: 0.22 },
        },
    ],
    JNG: [
        {
            id: 'jng_gank', name: 'Ganking Machine', blurb: 'Level three, bot side, flash up. You would rather make a play than take a camp.',
            mods: { mec: 2, tmf: 2, map: 1, lne: -1, knw: -2 },
            growth: { mec: 1.10, tmf: 1.08, knw: 0.92 },
            bias: { aggression: 0.82, risk: 0.72, teamplay: 0.62 },
        },
        {
            id: 'jng_farm', name: 'Farming Jungler', blurb: 'Clear, track, arrive on the objective one second before it matters. Boring, undefeated.',
            mods: { knw: 4, map: 3, mec: 1, ldr: -2, tmf: -1 },
            growth: { knw: 1.15, map: 1.10, ldr: 0.92 },
            bias: { aggression: 0.22, risk: 0.28, teamplay: 0.45 },
        },
        {
            id: 'jng_invade', name: 'Invader', blurb: 'The enemy jungle is your second camp rotation. High variance by design.',
            mods: { map: 4, mec: 2, knw: 1, cmp: -2, tmf: -2 },
            growth: { map: 1.15, mec: 1.06, cmp: 0.90 },
            bias: { aggression: 0.92, risk: 0.90, teamplay: 0.50 },
        },
        {
            id: 'jng_call', name: 'Shotcalling Jungler', blurb: 'You are the voice. Four people play the game you describe to them.',
            mods: { ldr: 5, knw: 3, map: 2, mec: -3, tmf: -1 },
            growth: { ldr: 1.20, knw: 1.08, mec: 0.88 },
            bias: { aggression: 0.42, risk: 0.40, teamplay: 1.00 },
        },
    ],
    MID: [
        {
            id: 'mid_assassin', name: 'Assassin', blurb: 'Zed, LeBlanc, Akali. Delete a carry, walk away, do it again in forty seconds.',
            mods: { mec: 5, lne: 2, tmf: -3, cmp: -1 },
            growth: { mec: 1.18, lne: 1.05, tmf: 0.88 },
            bias: { aggression: 0.85, risk: 0.82, teamplay: 0.28 },
        },
        {
            id: 'mid_control', name: 'Control Mage', blurb: 'Orianna, Viktor, Azir. You do not need to kill anyone before the fight starts.',
            mods: { knw: 3, tmf: 3, cmp: 2, mec: -2, map: -1 },
            growth: { knw: 1.12, tmf: 1.12, mec: 0.94 },
            bias: { aggression: 0.30, risk: 0.28, teamplay: 0.85 },
        },
        {
            id: 'mid_roam', name: 'Roaming Playmaker', blurb: 'Push, vanish, appear bot with a flanking angle nobody warded.',
            mods: { map: 4, ldr: 3, tmf: 1, lne: -2, mec: -1 },
            growth: { map: 1.15, ldr: 1.12, lne: 0.92 },
            bias: { aggression: 0.70, risk: 0.62, teamplay: 0.90 },
        },
        {
            id: 'mid_lane', name: 'Lane Dominator', blurb: 'Kill them, then kill them again. Priority is a resource and you hoard it.',
            mods: { lne: 5, mec: 2, cmp: 1, map: -3, ldr: -2 },
            growth: { lne: 1.18, mec: 1.06, map: 0.90 },
            bias: { aggression: 0.75, risk: 0.55, teamplay: 0.32 },
        },
    ],
    ADC: [
        {
            id: 'adc_hyper', name: 'Hypercarry', blurb: 'Jinx, Kog’Maw, Zeri. Give it twenty-eight minutes and one peel.',
            mods: { mec: 4, tmf: 3, cmp: -2, map: -2 },
            growth: { mec: 1.15, tmf: 1.10, map: 0.90 },
            bias: { aggression: 0.50, risk: 0.52, teamplay: 0.60 },
        },
        {
            id: 'adc_bully', name: 'Lane Bully', blurb: 'Caitlyn, Draven, Lucian. The game is decided before either jungler shows up.',
            mods: { lne: 5, mec: 2, tmf: -2, cmp: -1 },
            growth: { lne: 1.18, mec: 1.06, tmf: 0.94 },
            bias: { aggression: 0.82, risk: 0.72, teamplay: 0.40 },
        },
        {
            id: 'adc_safe', name: 'Safe Scaling', blurb: 'Ezreal, Ashe, Varus. Never dies, never loses lane, never on the highlight reel.',
            mods: { cmp: 5, knw: 2, map: 2, mec: -2, lne: -2 },
            growth: { cmp: 1.15, knw: 1.08, mec: 0.92 },
            bias: { aggression: 0.20, risk: 0.18, teamplay: 0.62 },
        },
        {
            id: 'adc_fight', name: 'Teamfight Specialist', blurb: 'Aphelios, Xayah, Kai’Sa. Five-versus-five is where your rating lives.',
            mods: { tmf: 5, cmp: 2, chp: 1, lne: -3, mec: -1 },
            growth: { tmf: 1.20, cmp: 1.06, lne: 0.90 },
            bias: { aggression: 0.45, risk: 0.42, teamplay: 0.90 },
        },
    ],
    SUP: [
        {
            id: 'sup_engage', name: 'Engage Support', blurb: 'Nautilus, Leona, Rakan. If you land it, the team wins. If you miss, it is a 4v5.',
            mods: { tmf: 4, ldr: 2, mec: 1, cmp: -2, knw: -1 },
            growth: { tmf: 1.15, ldr: 1.08, cmp: 0.92 },
            bias: { aggression: 0.90, risk: 0.82, teamplay: 0.80 },
        },
        {
            id: 'sup_enchant', name: 'Enchanter', blurb: 'Lulu, Milio, Nami. You do not make the play, you make the play survivable.',
            mods: { cmp: 4, tmf: 2, knw: 2, mec: -2, lne: -1 },
            growth: { cmp: 1.15, tmf: 1.08, mec: 0.92 },
            bias: { aggression: 0.20, risk: 0.20, teamplay: 1.00 },
        },
        {
            id: 'sup_roam', name: 'Roaming Vision', blurb: 'Bard, Pyke, Rakan. Bot lane is a place you visit between plays elsewhere.',
            mods: { map: 5, knw: 3, ldr: 1, mec: -3, lne: -2 },
            growth: { map: 1.20, knw: 1.10, lne: 0.90 },
            bias: { aggression: 0.62, risk: 0.65, teamplay: 0.78 },
        },
        {
            id: 'sup_bully', name: 'Lane Bully Support', blurb: 'Two-versus-two, level two, every single game. Bot lane is a fight, not a farm.',
            mods: { lne: 4, mec: 3, cmp: -2, map: -2 },
            growth: { lne: 1.15, mec: 1.10, map: 0.92 },
            bias: { aggression: 0.85, risk: 0.72, teamplay: 0.55 },
        },
    ],
};

export const PLAYSTYLE_BY_ID = Object.values(PLAYSTYLES).flat()
    .reduce((m, p) => { m[p.id] = p; return m; }, {});

// ─────────────────────────────────────────────────────────────────────────
//  CHAMPIONS
//  Your signature pick. Gives a permanent attribute shim at creation, and the
//  match engine hands out a "comfort pick" bonus on the games where you get
//  it. `roles` gates which champs appear for the role you chose.
// ─────────────────────────────────────────────────────────────────────────
export const CHAMPIONS = [
    // -- TOP ---------------------------------------------------------------
    { id: 'aatrox',   name: 'Aatrox',    roles: ['TOP'], archetype: 'Juggernaut', mods: { tmf: 3, mec: 2, cmp: -1 } },
    { id: 'camille',  name: 'Camille',   roles: ['TOP'], archetype: 'Diver',      mods: { mec: 4, map: 2, tmf: -2 } },
    { id: 'darius',   name: 'Darius',    roles: ['TOP'], archetype: 'Juggernaut', mods: { lne: 4, mec: 1, map: -2 } },
    { id: 'fiora',    name: 'Fiora',     roles: ['TOP'], archetype: 'Duelist',    mods: { mec: 5, lne: 1, tmf: -3 } },
    { id: 'gnar',     name: 'Gnar',      roles: ['TOP'], archetype: 'Skirmisher', mods: { tmf: 3, knw: 2, cmp: -1 } },
    { id: 'jax',      name: 'Jax',       roles: ['TOP'], archetype: 'Duelist',    mods: { mec: 3, lne: 2, ldr: -1 } },
    { id: 'ksante',   name: 'K\u2019Sante', roles: ['TOP'], archetype: 'Warden',  mods: { tmf: 4, cmp: 2, mec: -2 } },
    { id: 'malphite', name: 'Malphite',  roles: ['TOP'], archetype: 'Vanguard',   mods: { tmf: 4, cmp: 3, mec: -4 } },
    { id: 'ornn',     name: 'Ornn',      roles: ['TOP'], archetype: 'Vanguard',   mods: { tmf: 4, knw: 2, lne: -2 } },
    { id: 'renekton', name: 'Renekton',  roles: ['TOP'], archetype: 'Diver',      mods: { lne: 5, mec: 1, cmp: -2 } },
    { id: 'riven',    name: 'Riven',     roles: ['TOP'], archetype: 'Skirmisher', mods: { mec: 5, cmp: -2, knw: -1 } },
    { id: 'sett',     name: 'Sett',      roles: ['TOP'], archetype: 'Juggernaut', mods: { tmf: 3, lne: 2, map: -2 } },
    { id: 'gwen',     name: 'Gwen',      roles: ['TOP'], archetype: 'Skirmisher', mods: { mec: 3, chp: 2, lne: -1 } },
    { id: 'rumble',   name: 'Rumble',    roles: ['TOP', 'MID'], archetype: 'Battlemage', mods: { tmf: 4, knw: 2, mec: -1 } },

    // -- JUNGLE ------------------------------------------------------------
    { id: 'leesin',   name: 'Lee Sin',   roles: ['JNG'], archetype: 'Diver',      mods: { mec: 5, ldr: 1, cmp: -2 } },
    { id: 'viego',    name: 'Viego',     roles: ['JNG'], archetype: 'Skirmisher', mods: { mec: 4, tmf: 2, knw: -2 } },
    { id: 'jarvan',   name: 'Jarvan IV', roles: ['JNG'], archetype: 'Diver',      mods: { tmf: 4, ldr: 2, mec: -1 } },
    { id: 'sejuani',  name: 'Sejuani',   roles: ['JNG'], archetype: 'Vanguard',   mods: { tmf: 4, cmp: 2, mec: -3 } },
    { id: 'nidalee',  name: 'Nidalee',   roles: ['JNG'], archetype: 'Specialist', mods: { mec: 5, map: 2, tmf: -3 } },
    { id: 'vi',       name: 'Vi',        roles: ['JNG'], archetype: 'Diver',      mods: { tmf: 3, mec: 2, map: -1 } },
    { id: 'xinzhao',  name: 'Xin Zhao',  roles: ['JNG'], archetype: 'Diver',      mods: { mec: 2, tmf: 3, knw: -1 } },
    { id: 'graves',   name: 'Graves',    roles: ['JNG'], archetype: 'Specialist', mods: { mec: 4, knw: 2, ldr: -2 } },
    { id: 'maokai',   name: 'Maokai',    roles: ['JNG', 'SUP'], archetype: 'Vanguard', mods: { map: 4, tmf: 2, mec: -3 } },
    { id: 'kindred',  name: 'Kindred',   roles: ['JNG'], archetype: 'Marksman',   mods: { knw: 4, map: 2, cmp: -2 } },
    { id: 'elise',    name: 'Elise',     roles: ['JNG'], archetype: 'Assassin',   mods: { mec: 4, map: 2, cmp: -2 } },
    { id: 'wukong',   name: 'Wukong',    roles: ['JNG', 'TOP'], archetype: 'Diver', mods: { tmf: 4, mec: 1, knw: -1 } },

    // -- MID ---------------------------------------------------------------
    { id: 'ahri',     name: 'Ahri',      roles: ['MID'], archetype: 'Mage',       mods: { map: 3, cmp: 2, lne: -1 } },
    { id: 'azir',     name: 'Azir',      roles: ['MID'], archetype: 'Mage',       mods: { mec: 5, tmf: 2, cmp: -3 } },
    { id: 'orianna',  name: 'Orianna',   roles: ['MID'], archetype: 'Mage',       mods: { tmf: 5, knw: 2, lne: -2 } },
    { id: 'sylas',    name: 'Sylas',     roles: ['MID'], archetype: 'Skirmisher', mods: { chp: 4, mec: 2, knw: -1 } },
    { id: 'yasuo',    name: 'Yasuo',     roles: ['MID'], archetype: 'Skirmisher', mods: { mec: 5, cmp: -3, ldr: -1 } },
    { id: 'leblanc',  name: 'LeBlanc',   roles: ['MID'], archetype: 'Assassin',   mods: { mec: 4, lne: 2, tmf: -3 } },
    { id: 'syndra',   name: 'Syndra',    roles: ['MID'], archetype: 'Mage',       mods: { lne: 4, tmf: 2, map: -2 } },
    { id: 'viktor',   name: 'Viktor',    roles: ['MID'], archetype: 'Mage',       mods: { knw: 4, tmf: 2, mec: -1 } },
    { id: 'zed',      name: 'Zed',       roles: ['MID'], archetype: 'Assassin',   mods: { mec: 5, lne: 1, tmf: -3 } },
    { id: 'corki',    name: 'Corki',     roles: ['MID'], archetype: 'Marksman',   mods: { knw: 3, tmf: 2, mec: -1 } },
    { id: 'taliyah',  name: 'Taliyah',   roles: ['MID', 'JNG'], archetype: 'Mage',    mods: { map: 4, ldr: 2, lne: -2 } },
    { id: 'akali',    name: 'Akali',     roles: ['MID'], archetype: 'Assassin',   mods: { mec: 5, cmp: -2, knw: -1 } },

    // -- ADC ---------------------------------------------------------------
    { id: 'jinx',     name: 'Jinx',      roles: ['ADC'], archetype: 'Hypercarry', mods: { tmf: 4, mec: 2, lne: -2 } },
    { id: 'kaisa',    name: 'Kai\u2019Sa', roles: ['ADC'], archetype: 'Hypercarry', mods: { mec: 4, tmf: 2, cmp: -1 } },
    { id: 'aphelios', name: 'Aphelios',  roles: ['ADC'], archetype: 'Specialist', mods: { knw: 5, tmf: 2, cmp: -2 } },
    { id: 'ezreal',   name: 'Ezreal',    roles: ['ADC'], archetype: 'Poke',       mods: { cmp: 4, mec: 2, tmf: -2 } },
    { id: 'caitlyn',  name: 'Caitlyn',   roles: ['ADC'], archetype: 'Lane Bully', mods: { lne: 5, knw: 1, tmf: -2 } },
    { id: 'xayah',    name: 'Xayah',     roles: ['ADC'], archetype: 'Hypercarry', mods: { tmf: 4, cmp: 2, lne: -1 } },
    { id: 'varus',    name: 'Varus',     roles: ['ADC'], archetype: 'Poke',       mods: { knw: 3, lne: 2, mec: -1 } },
    { id: 'lucian',   name: 'Lucian',    roles: ['ADC'], archetype: 'Lane Bully', mods: { mec: 4, lne: 3, cmp: -3 } },
    { id: 'zeri',     name: 'Zeri',      roles: ['ADC'], archetype: 'Hypercarry', mods: { mec: 5, map: 1, cmp: -2 } },
    { id: 'ashe',     name: 'Ashe',      roles: ['ADC'], archetype: 'Utility',    mods: { map: 4, ldr: 2, mec: -3 } },
    { id: 'draven',   name: 'Draven',    roles: ['ADC'], archetype: 'Lane Bully', mods: { mec: 5, lne: 3, cmp: -4 } },
    { id: 'jhin',     name: 'Jhin',      roles: ['ADC'], archetype: 'Specialist', mods: { cmp: 3, knw: 3, mec: -2 } },

    // -- SUPPORT -----------------------------------------------------------
    { id: 'thresh',   name: 'Thresh',    roles: ['SUP'], archetype: 'Catcher',    mods: { mec: 4, tmf: 2, cmp: -1 } },
    { id: 'nautilus', name: 'Nautilus',  roles: ['SUP'], archetype: 'Vanguard',   mods: { tmf: 4, lne: 2, map: -1 } },
    { id: 'lulu',     name: 'Lulu',      roles: ['SUP'], archetype: 'Enchanter',  mods: { cmp: 4, tmf: 2, lne: -2 } },
    { id: 'nami',     name: 'Nami',      roles: ['SUP'], archetype: 'Enchanter',  mods: { cmp: 3, lne: 2, map: -1 } },
    { id: 'rakan',    name: 'Rakan',     roles: ['SUP'], archetype: 'Catcher',    mods: { tmf: 4, map: 2, cmp: -2 } },
    { id: 'leona',    name: 'Leona',     roles: ['SUP'], archetype: 'Vanguard',   mods: { tmf: 4, lne: 3, map: -3 } },
    { id: 'renata',   name: 'Renata Glasc', roles: ['SUP'], archetype: 'Enchanter', mods: { tmf: 4, knw: 2, mec: -2 } },
    { id: 'bard',     name: 'Bard',      roles: ['SUP'], archetype: 'Catcher',    mods: { map: 5, chp: 2, lne: -3 } },
    { id: 'karma',    name: 'Karma',     roles: ['SUP'], archetype: 'Enchanter',  mods: { lne: 3, cmp: 2, tmf: -1 } },
    { id: 'braum',    name: 'Braum',     roles: ['SUP'], archetype: 'Warden',     mods: { cmp: 4, tmf: 2, mec: -2 } },
    { id: 'pyke',     name: 'Pyke',      roles: ['SUP'], archetype: 'Assassin',   mods: { mec: 5, map: 2, cmp: -3 } },
    { id: 'milio',    name: 'Milio',     roles: ['SUP'], archetype: 'Enchanter',  mods: { cmp: 4, knw: 2, mec: -3 } },

    // =====================================================================
    //  The rest of the roster. Same rules: 2-3 mods, positives summing 5-8,
    //  at least one cost, net +1 to +5, and an archetype that exists in
    //  match.js's ARCHETYPE_BIAS table. tools/championCheck.mjs enforces all
    //  of it - an archetype typo does not crash, it just silently deletes
    //  that champion's comfort-pick bonus forever.
    // =====================================================================

    // -- TOP ---------------------------------------------------------------
    { id: 'ambessa',       name: 'Ambessa',           roles: ['TOP'],                 archetype: 'Skirmisher',   mods: { mec: 5, tmf: 2, cmp: -3 } },
    { id: 'aurora',        name: 'Aurora',            roles: ['TOP', 'MID'],          archetype: 'Mage',         mods: { mec: 3, tmf: 3, lne: -2 } },
    { id: 'chogath',       name: 'Cho\u2019Gath',     roles: ['TOP'],                 archetype: 'Battlemage',   mods: { knw: 4, tmf: 2, mec: -2 } },
    { id: 'drmundo',       name: 'Dr. Mundo',         roles: ['TOP', 'JNG'],          archetype: 'Juggernaut',   mods: { cmp: 4, tmf: 2, mec: -3 } },
    { id: 'gangplank',     name: 'Gangplank',         roles: ['TOP'],                 archetype: 'Specialist',   mods: { mec: 5, knw: 2, cmp: -3 } },
    { id: 'garen',         name: 'Garen',             roles: ['TOP'],                 archetype: 'Juggernaut',   mods: { lne: 4, cmp: 2, mec: -3 } },
    { id: 'heimerdinger',  name: 'Heimerdinger',      roles: ['TOP', 'MID'],          archetype: 'Specialist',   mods: { knw: 4, lne: 3, map: -3 } },
    { id: 'illaoi',        name: 'Illaoi',            roles: ['TOP'],                 archetype: 'Juggernaut',   mods: { lne: 5, cmp: 2, map: -3 } },
    { id: 'irelia',        name: 'Irelia',            roles: ['TOP', 'MID'],          archetype: 'Skirmisher',   mods: { mec: 5, lne: 2, cmp: -3 } },
    { id: 'jayce',         name: 'Jayce',             roles: ['TOP', 'MID'],          archetype: 'Poke',         mods: { lne: 4, mec: 2, tmf: -3 } },
    { id: 'kayle',         name: 'Kayle',             roles: ['TOP'],                 archetype: 'Hypercarry',   mods: { tmf: 3, cmp: 3, lne: -4 } },
    { id: 'kennen',        name: 'Kennen',            roles: ['TOP'],                 archetype: 'Mage',         mods: { tmf: 5, lne: 2, mec: -2 } },
    { id: 'kled',          name: 'Kled',              roles: ['TOP'],                 archetype: 'Skirmisher',   mods: { lne: 4, mec: 2, map: -2 } },
    { id: 'mordekaiser',   name: 'Mordekaiser',       roles: ['TOP'],                 archetype: 'Juggernaut',   mods: { lne: 3, tmf: 3, map: -2 } },
    { id: 'nasus',         name: 'Nasus',             roles: ['TOP'],                 archetype: 'Juggernaut',   mods: { cmp: 4, knw: 2, lne: -3 } },
    { id: 'olaf',          name: 'Olaf',              roles: ['TOP', 'JNG'],          archetype: 'Juggernaut',   mods: { lne: 4, cmp: 2, map: -3 } },
    { id: 'pantheon',      name: 'Pantheon',          roles: ['TOP', 'MID', 'SUP'],   archetype: 'Lane Bully',   mods: { lne: 5, map: 2, tmf: -3 } },
    { id: 'poppy',         name: 'Poppy',             roles: ['TOP', 'JNG', 'SUP'],   archetype: 'Warden',       mods: { tmf: 3, knw: 3, lne: -2 } },
    { id: 'quinn',         name: 'Quinn',             roles: ['TOP'],                 archetype: 'Marksman',     mods: { map: 5, lne: 2, tmf: -3 } },
    { id: 'shen',          name: 'Shen',              roles: ['TOP'],                 archetype: 'Warden',       mods: { map: 5, ldr: 2, lne: -3 } },
    { id: 'singed',        name: 'Singed',            roles: ['TOP'],                 archetype: 'Specialist',   mods: { map: 4, cmp: 3, mec: -3 } },
    { id: 'sion',          name: 'Sion',              roles: ['TOP'],                 archetype: 'Vanguard',     mods: { map: 4, tmf: 3, mec: -3 } },
    { id: 'skarner',       name: 'Skarner',           roles: ['TOP', 'JNG'],          archetype: 'Vanguard',     mods: { tmf: 5, cmp: 2, mec: -3 } },
    { id: 'teemo',         name: 'Teemo',             roles: ['TOP'],                 archetype: 'Specialist',   mods: { map: 3, knw: 3, tmf: -3 } },
    { id: 'trundle',       name: 'Trundle',           roles: ['TOP', 'JNG'],          archetype: 'Juggernaut',   mods: { lne: 4, ldr: 2, tmf: -2 } },
    { id: 'tryndamere',    name: 'Tryndamere',        roles: ['TOP'],                 archetype: 'Duelist',      mods: { map: 4, cmp: 2, tmf: -3 } },
    { id: 'urgot',         name: 'Urgot',             roles: ['TOP'],                 archetype: 'Juggernaut',   mods: { lne: 4, knw: 2, map: -2 } },
    { id: 'volibear',      name: 'Volibear',          roles: ['TOP', 'JNG'],          archetype: 'Juggernaut',   mods: { tmf: 4, lne: 2, mec: -3 } },
    { id: 'yone',          name: 'Yone',              roles: ['TOP', 'MID'],          archetype: 'Skirmisher',   mods: { mec: 4, tmf: 2, cmp: -2 } },
    { id: 'yorick',        name: 'Yorick',            roles: ['TOP'],                 archetype: 'Duelist',      mods: { map: 4, lne: 2, tmf: -3 } },
    { id: 'zaahen',        name: 'Zaahen',            roles: ['TOP', 'JNG'],          archetype: 'Skirmisher',   mods: { mec: 4, tmf: 3, map: -2 } },

    // -- JUNGLE ------------------------------------------------------------
    { id: 'amumu',         name: 'Amumu',             roles: ['JNG', 'SUP'],          archetype: 'Vanguard',     mods: { tmf: 5, cmp: 2, mec: -3 } },
    { id: 'belveth',       name: 'Bel\u2019Veth',     roles: ['JNG'],                 archetype: 'Skirmisher',   mods: { mec: 5, knw: 2, cmp: -3 } },
    { id: 'briar',         name: 'Briar',             roles: ['JNG'],                 archetype: 'Diver',        mods: { tmf: 4, mec: 2, cmp: -3 } },
    { id: 'diana',         name: 'Diana',             roles: ['JNG', 'MID'],          archetype: 'Diver',        mods: { tmf: 4, mec: 2, cmp: -2 } },
    { id: 'ekko',          name: 'Ekko',              roles: ['JNG', 'MID'],          archetype: 'Assassin',     mods: { mec: 5, map: 2, cmp: -3 } },
    { id: 'evelynn',       name: 'Evelynn',           roles: ['JNG'],                 archetype: 'Assassin',     mods: { map: 5, mec: 2, tmf: -2 } },
    { id: 'fiddlesticks',  name: 'Fiddlesticks',      roles: ['JNG'],                 archetype: 'Specialist',   mods: { map: 4, tmf: 3, mec: -3 } },
    { id: 'gragas',        name: 'Gragas',            roles: ['JNG', 'TOP', 'SUP'],   archetype: 'Vanguard',     mods: { tmf: 4, mec: 3, map: -2 } },
    { id: 'hecarim',       name: 'Hecarim',           roles: ['JNG'],                 archetype: 'Diver',        mods: { tmf: 4, map: 2, cmp: -2 } },
    { id: 'ivern',         name: 'Ivern',             roles: ['JNG'],                 archetype: 'Enchanter',    mods: { map: 4, tmf: 2, mec: -2 } },
    { id: 'karthus',       name: 'Karthus',           roles: ['JNG'],                 archetype: 'Specialist',   mods: { knw: 4, map: 2, mec: -2 } },
    { id: 'kayn',          name: 'Kayn',              roles: ['JNG'],                 archetype: 'Skirmisher',   mods: { mec: 4, chp: 2, cmp: -2 } },
    { id: 'khazix',        name: 'Kha\u2019Zix',      roles: ['JNG'],                 archetype: 'Assassin',     mods: { mec: 3, map: 3, tmf: -3 } },
    { id: 'lillia',        name: 'Lillia',            roles: ['JNG'],                 archetype: 'Skirmisher',   mods: { mec: 3, tmf: 3, cmp: -2 } },
    { id: 'masteryi',      name: 'Master Yi',         roles: ['JNG'],                 archetype: 'Skirmisher',   mods: { tmf: 4, cmp: 2, chp: -3 } },
    { id: 'nocturne',      name: 'Nocturne',          roles: ['JNG'],                 archetype: 'Diver',        mods: { tmf: 4, knw: 2, mec: -2 } },
    { id: 'nunu',          name: 'Nunu & Willump',    roles: ['JNG'],                 archetype: 'Vanguard',     mods: { map: 4, knw: 2, mec: -2 } },
    { id: 'rammus',        name: 'Rammus',            roles: ['JNG'],                 archetype: 'Vanguard',     mods: { tmf: 4, knw: 2, mec: -3 } },
    { id: 'reksai',        name: 'Rek\u2019Sai',      roles: ['JNG'],                 archetype: 'Diver',        mods: { map: 4, mec: 3, tmf: -3 } },
    { id: 'rengar',        name: 'Rengar',            roles: ['JNG', 'TOP'],          archetype: 'Assassin',     mods: { mec: 4, map: 2, tmf: -3 } },
    { id: 'shaco',         name: 'Shaco',             roles: ['JNG'],                 archetype: 'Assassin',     mods: { mec: 4, map: 3, tmf: -3 } },
    { id: 'shyvana',       name: 'Shyvana',           roles: ['JNG'],                 archetype: 'Diver',        mods: { tmf: 3, knw: 3, map: -2 } },
    { id: 'udyr',          name: 'Udyr',              roles: ['JNG', 'TOP'],          archetype: 'Juggernaut',   mods: { mec: 3, lne: 3, map: -2 } },
    { id: 'warwick',       name: 'Warwick',           roles: ['JNG', 'TOP'],          archetype: 'Diver',        mods: { lne: 3, cmp: 2, mec: -2 } },
    { id: 'zac',           name: 'Zac',               roles: ['JNG', 'TOP'],          archetype: 'Vanguard',     mods: { tmf: 4, map: 2, mec: -3 } },

    // -- MID ---------------------------------------------------------------
    { id: 'akshan',        name: 'Akshan',            roles: ['MID', 'TOP'],          archetype: 'Marksman',     mods: { mec: 4, map: 2, tmf: -2 } },
    { id: 'anivia',        name: 'Anivia',            roles: ['MID'],                 archetype: 'Mage',         mods: { tmf: 4, knw: 2, lne: -2 } },
    { id: 'annie',         name: 'Annie',             roles: ['MID', 'SUP'],          archetype: 'Mage',         mods: { tmf: 4, lne: 3, mec: -4 } },
    { id: 'aurelionsol',   name: 'Aurelion Sol',      roles: ['MID'],                 archetype: 'Battlemage',   mods: { tmf: 3, knw: 3, lne: -2 } },
    { id: 'cassiopeia',    name: 'Cassiopeia',        roles: ['MID'],                 archetype: 'Battlemage',   mods: { mec: 4, tmf: 2, map: -2 } },
    { id: 'fizz',          name: 'Fizz',              roles: ['MID'],                 archetype: 'Assassin',     mods: { mec: 5, tmf: -3 } },
    { id: 'galio',         name: 'Galio',             roles: ['MID', 'SUP'],          archetype: 'Vanguard',     mods: { map: 3, tmf: 3, lne: -2 } },
    { id: 'hwei',          name: 'Hwei',              roles: ['MID', 'SUP'],          archetype: 'Mage',         mods: { knw: 4, mec: 2, lne: -2 } },
    { id: 'kassadin',      name: 'Kassadin',          roles: ['MID'],                 archetype: 'Assassin',     mods: { cmp: 4, tmf: 2, lne: -3 } },
    { id: 'katarina',      name: 'Katarina',          roles: ['MID'],                 archetype: 'Assassin',     mods: { mec: 5, chp: 2, cmp: -3 } },
    { id: 'lissandra',     name: 'Lissandra',         roles: ['MID'],                 archetype: 'Mage',         mods: { tmf: 4, cmp: 2, mec: -3 } },
    { id: 'locke',         name: 'Locke',             roles: ['MID'],                 archetype: 'Assassin',     mods: { mec: 4, knw: 3, tmf: -3 } },
    { id: 'lux',           name: 'Lux',               roles: ['MID', 'SUP'],          archetype: 'Mage',         mods: { lne: 3, tmf: 3, mec: -2 } },
    { id: 'malzahar',      name: 'Malzahar',          roles: ['MID'],                 archetype: 'Mage',         mods: { lne: 4, cmp: 2, mec: -3 } },
    { id: 'mel',           name: 'Mel',               roles: ['MID', 'SUP'],          archetype: 'Mage',         mods: { knw: 4, tmf: 2, mec: -2 } },
    { id: 'naafiri',       name: 'Naafiri',           roles: ['MID', 'JNG'],          archetype: 'Assassin',     mods: { cmp: 4, map: 2, mec: -3 } },
    { id: 'neeko',         name: 'Neeko',             roles: ['MID', 'SUP'],          archetype: 'Mage',         mods: { map: 3, tmf: 3, lne: -2 } },
    { id: 'qiyana',        name: 'Qiyana',            roles: ['MID', 'JNG'],          archetype: 'Assassin',     mods: { mec: 5, tmf: 2, cmp: -3 } },
    { id: 'ryze',          name: 'Ryze',              roles: ['MID', 'TOP'],          archetype: 'Battlemage',   mods: { mec: 4, map: 2, lne: -2 } },
    { id: 'swain',         name: 'Swain',             roles: ['MID', 'SUP', 'ADC'],   archetype: 'Battlemage',   mods: { tmf: 5, knw: 1, mec: -2 } },
    { id: 'talon',         name: 'Talon',             roles: ['MID', 'JNG'],          archetype: 'Assassin',     mods: { map: 4, mec: 2, tmf: -3 } },
    { id: 'twistedfate',   name: 'Twisted Fate',      roles: ['MID'],                 archetype: 'Specialist',   mods: { map: 5, ldr: 2, mec: -3 } },
    { id: 'veigar',        name: 'Veigar',            roles: ['MID'],                 archetype: 'Mage',         mods: { knw: 4, tmf: 2, lne: -2 } },
    { id: 'velkoz',        name: 'Vel\u2019Koz',      roles: ['MID', 'SUP'],          archetype: 'Poke',         mods: { mec: 4, lne: 2, map: -2 } },
    { id: 'vex',           name: 'Vex',               roles: ['MID'],                 archetype: 'Mage',         mods: { tmf: 4, map: 2, mec: -2 } },
    { id: 'vladimir',      name: 'Vladimir',          roles: ['MID', 'TOP'],          archetype: 'Battlemage',   mods: { tmf: 4, cmp: 2, lne: -3 } },
    { id: 'xerath',        name: 'Xerath',            roles: ['MID', 'SUP'],          archetype: 'Poke',         mods: { mec: 4, knw: 2, map: -2 } },
    { id: 'ziggs',         name: 'Ziggs',             roles: ['MID', 'ADC'],          archetype: 'Poke',         mods: { lne: 3, knw: 3, mec: -2 } },
    { id: 'zoe',           name: 'Zoe',               roles: ['MID'],                 archetype: 'Mage',         mods: { mec: 5, knw: 2, cmp: -3 } },

    // -- ADC ---------------------------------------------------------------
    { id: 'kalista',       name: 'Kalista',           roles: ['ADC'],                 archetype: 'Lane Bully',   mods: { mec: 4, lne: 3, cmp: -2 } },
    { id: 'kogmaw',        name: 'Kog\u2019Maw',      roles: ['ADC'],                 archetype: 'Hypercarry',   mods: { tmf: 4, cmp: 2, map: -3 } },
    { id: 'missfortune',   name: 'Miss Fortune',      roles: ['ADC'],                 archetype: 'Lane Bully',   mods: { lne: 4, tmf: 3, mec: -3 } },
    { id: 'nilah',         name: 'Nilah',             roles: ['ADC'],                 archetype: 'Specialist',   mods: { mec: 3, tmf: 3, chp: -2 } },
    { id: 'samira',        name: 'Samira',            roles: ['ADC'],                 archetype: 'Skirmisher',   mods: { mec: 5, tmf: 2, cmp: -3 } },
    { id: 'sivir',         name: 'Sivir',             roles: ['ADC'],                 archetype: 'Utility',      mods: { tmf: 3, knw: 2, mec: -2 } },
    { id: 'smolder',       name: 'Smolder',           roles: ['ADC', 'MID'],          archetype: 'Hypercarry',   mods: { cmp: 3, knw: 3, lne: -2 } },
    { id: 'tristana',      name: 'Tristana',          roles: ['ADC', 'MID'],          archetype: 'Hypercarry',   mods: { lne: 4, mec: 2, tmf: -2 } },
    { id: 'twitch',        name: 'Twitch',            roles: ['ADC'],                 archetype: 'Hypercarry',   mods: { map: 4, tmf: 2, lne: -3 } },
    { id: 'vayne',         name: 'Vayne',             roles: ['ADC', 'TOP'],          archetype: 'Hypercarry',   mods: { mec: 5, cmp: 2, lne: -3 } },
    { id: 'yunara',        name: 'Yunara',            roles: ['ADC'],                 archetype: 'Hypercarry',   mods: { mec: 3, tmf: 3, lne: -3 } },

    // -- SUPPORT -----------------------------------------------------------
    { id: 'alistar',       name: 'Alistar',           roles: ['SUP'],                 archetype: 'Vanguard',     mods: { mec: 2, tmf: 4, knw: -2 } },
    { id: 'blitzcrank',    name: 'Blitzcrank',        roles: ['SUP'],                 archetype: 'Catcher',      mods: { mec: 5, map: 2, tmf: -3 } },
    { id: 'brand',         name: 'Brand',             roles: ['SUP', 'MID'],          archetype: 'Battlemage',   mods: { tmf: 5, knw: 2, mec: -3 } },
    { id: 'janna',         name: 'Janna',             roles: ['SUP'],                 archetype: 'Enchanter',    mods: { tmf: 4, cmp: 3, lne: -3 } },
    { id: 'morgana',       name: 'Morgana',           roles: ['SUP'],                 archetype: 'Catcher',      mods: { mec: 4, knw: 3, lne: -2 } },
    { id: 'rell',          name: 'Rell',              roles: ['SUP'],                 archetype: 'Vanguard',     mods: { tmf: 5, ldr: 2, mec: -2 } },
    { id: 'senna',         name: 'Senna',             roles: ['SUP', 'ADC'],          archetype: 'Utility',      mods: { map: 4, tmf: 2, lne: -2 } },
    { id: 'seraphine',     name: 'Seraphine',         roles: ['SUP', 'MID'],          archetype: 'Enchanter',    mods: { tmf: 4, lne: 2, mec: -3 } },
    { id: 'sona',          name: 'Sona',              roles: ['SUP'],                 archetype: 'Enchanter',    mods: { tmf: 5, lne: -3, mec: -1 } },
    { id: 'soraka',        name: 'Soraka',            roles: ['SUP'],                 archetype: 'Enchanter',    mods: { cmp: 4, knw: 3, mec: -3 } },
    { id: 'tahmkench',     name: 'Tahm Kench',        roles: ['SUP', 'TOP'],          archetype: 'Warden',       mods: { tmf: 4, cmp: 2, lne: -2 } },
    { id: 'taric',         name: 'Taric',             roles: ['SUP'],                 archetype: 'Warden',       mods: { tmf: 4, knw: 3, lne: -2 } },
    { id: 'yuumi',         name: 'Yuumi',             roles: ['SUP'],                 archetype: 'Enchanter',    mods: { tmf: 5, mec: -3, map: -1 } },
    { id: 'zilean',        name: 'Zilean',            roles: ['SUP', 'MID'],          archetype: 'Enchanter',    mods: { tmf: 4, ldr: 2, mec: -2 } },
    { id: 'zyra',          name: 'Zyra',              roles: ['SUP', 'JNG'],          archetype: 'Catcher',      mods: { tmf: 4, lne: 2, map: -2 } },

];

export const CHAMPION_BY_ID = CHAMPIONS.reduce((m, c) => { m[c.id] = c; return m; }, {});
export function championsForRole(role) {
    return CHAMPIONS.filter(c => c.roles.includes(role));
}

// ─────────────────────────────────────────────────────────────────────────
//  ARCHETYPE BIAS
//  How a champion's archetype wants to be played, on the same
//  {aggression, risk, teamplay} triple that every playstyle carries.
//
//  This table used to live in match.js, where the match engine matched it
//  against an in-game option's bias to hand out the comfort-pick bonus. It moved
//  here because it is now read by TWO consumers that must agree: that comfort
//  bonus, and championsForStyle() below, which decides whether a champion is a
//  legal signature pick for your playstyle. A champion that fits your playstyle
//  is literally a champion that gets comfort on the same decisions your identity
//  already helps you win — one table, one meaning.
//
//  tools/championCheck.mjs imports this directly. Every archetype used by any
//  entry in CHAMPIONS must have a row here or the comfort bonus silently never
//  fires for it.
// ─────────────────────────────────────────────────────────────────────────
export const ARCHETYPE_BIAS = {
    Juggernaut: { aggression: 0.70, risk: 0.45, teamplay: 0.55 },
    Diver:      { aggression: 0.85, risk: 0.75, teamplay: 0.65 },
    Duelist:    { aggression: 0.72, risk: 0.62, teamplay: 0.25 },
    Skirmisher: { aggression: 0.75, risk: 0.65, teamplay: 0.40 },
    Warden:     { aggression: 0.30, risk: 0.25, teamplay: 0.95 },
    Vanguard:   { aggression: 0.80, risk: 0.70, teamplay: 0.90 },
    Battlemage: { aggression: 0.50, risk: 0.40, teamplay: 0.75 },
    Specialist: { aggression: 0.50, risk: 0.55, teamplay: 0.55 },
    Marksman:   { aggression: 0.45, risk: 0.45, teamplay: 0.60 },
    Assassin:   { aggression: 0.90, risk: 0.88, teamplay: 0.25 },
    Mage:       { aggression: 0.40, risk: 0.35, teamplay: 0.80 },
    Hypercarry: { aggression: 0.35, risk: 0.35, teamplay: 0.65 },
    Poke:       { aggression: 0.40, risk: 0.30, teamplay: 0.70 },
    'Lane Bully': { aggression: 0.85, risk: 0.65, teamplay: 0.35 },
    Utility:    { aggression: 0.30, risk: 0.30, teamplay: 0.90 },
    Catcher:    { aggression: 0.75, risk: 0.75, teamplay: 0.80 },
    Enchanter:  { aggression: 0.20, risk: 0.20, teamplay: 1.00 },
};

// ─────────────────────────────────────────────────────────────────────────
//  MATCHUPS
//  Who beats who, by ARCHETYPE.
//
//  This is DESIGNED rock-paper-scissors, not scraped win rates. There is no
//  real matchup data anywhere in this project and a 173x173 champion table
//  would be thirty thousand cells of invented statistics, so the counters run
//  on the seventeen archetypes the comfort bonus and the playstyle fit rule
//  already use. Texture between two champions of the same archetype comes from
//  their `mods` instead (see laneEdge below), so Fiora and Jax are not identical
//  into the same lane.
//
//  Authored ONE DIRECTION ONLY. `beats` is the whole table; the losing side is
//  generated from it, so the matrix cannot contradict itself and a pair listed
//  in both directions is a hard error in tools/championCheck.mjs.
//
//    2 = a real counter. You are behind before the game starts.
//    1 = an edge. Noticeable, not decisive.
//
//  If a genuine data source ever turns up, replace ARCHETYPE_COUNTERS and
//  nothing else has to change.
// ─────────────────────────────────────────────────────────────────────────
const ARCHETYPE_COUNTERS = {
    // Dive the squishy thing. Bounce off the tanky one.
    Assassin:   { Mage: 2, Marksman: 2, Hypercarry: 2, Poke: 1, Enchanter: 1, Battlemage: 1 },
    Diver:      { Marksman: 2, Enchanter: 1, Poke: 2, Hypercarry: 2, Mage: 1 },
    // Sustained single-target damage. Beats things that cannot disengage.
    Duelist:    { Juggernaut: 1, Marksman: 1, Specialist: 1 },
    Skirmisher: { Juggernaut: 1, Marksman: 1, Catcher: 1 },
    // Tanks eat divers and get shredded by sustained or percent damage.
    Warden:     { Assassin: 2, Diver: 1, Duelist: 1, Catcher: 1, 'Lane Bully': 1 },
    Vanguard:   { Assassin: 1, Marksman: 2, Enchanter: 2, Diver: 1 },
    // Juggernaut is the classic "everyone kites you" archetype and its net is
    // meant to be negative - but it beats the things that have to come to it.
    Juggernaut: { Vanguard: 1, Warden: 1, Catcher: 1, Assassin: 1, Diver: 1, Specialist: 1 },
    // Range and area damage against anything that has to walk at you.
    Battlemage: { Juggernaut: 2, Warden: 1, Vanguard: 1, Catcher: 1 },
    Mage:       { Juggernaut: 1, Vanguard: 1, Skirmisher: 1, Catcher: 1, 'Lane Bully': 1 },
    // Poke beats melee. Skirmisher is here because it is otherwise uncounterable
    // in the ADC pool, which has no Mage.
    Poke:       { Juggernaut: 2, Vanguard: 2, Warden: 1, Catcher: 1, 'Lane Bully': 1, Skirmisher: 1 },
    // Carries beat the durable things, given the time to do it.
    Marksman:   { Warden: 2, Juggernaut: 1, Battlemage: 1 },
    Hypercarry: { Warden: 2, Juggernaut: 2, Battlemage: 1 },
    // Bot-lane and support-side identities.
    'Lane Bully': { Hypercarry: 2, Enchanter: 1, Utility: 1, Specialist: 1 },
    Catcher:    { Enchanter: 1, Hypercarry: 1, Utility: 1 },
    Enchanter:  { Poke: 1, Duelist: 1 },
    Utility:    { Poke: 1, Battlemage: 1 },
    Specialist: { Warden: 1, Mage: 1 },
};

/** The full signed matrix, generated so it can never disagree with itself. */
const _MATCHUP = (() => {
    const m = {};
    for (const a of Object.keys(ARCHETYPE_BIAS)) m[a] = {};
    for (const [winner, losers] of Object.entries(ARCHETYPE_COUNTERS)) {
        for (const [loser, weight] of Object.entries(losers)) {
            if (!m[winner] || !m[loser]) continue;   // validated by championCheck
            m[winner][loser] = weight;
            m[loser][winner] = -weight;
        }
    }
    return m;
})();

export { ARCHETYPE_COUNTERS };

/** Signed archetype matchup: > 0 means `mine` is favoured. Range -2..2. */
export function archetypeMatchup(mine, theirs) {
    const row = _MATCHUP[mine];
    if (!row || !theirs) return 0;
    return Number(row[theirs]) || 0;
}

/**
 * A small tie-breaker between two champions of the same archetype, from the
 * attribute shims they already carry. A champion whose mods lean into laning
 * and mechanics is a harder lane than one that leans into teamfighting, and
 * that is real authored data rather than another invented number.
 * Deliberately small: about a fifth of one counter step.
 */
export function laneEdge(mine, theirs) {
    const lane = c => (c && c.mods ? (Number(c.mods.lne) || 0) + (Number(c.mods.mec) || 0) * 0.5 : 0);
    // The lane values run -4 to +5.5, so at the 0.08 this started on the shim
    // could swing 0.76 - three quarters of a full counter step, applied to every
    // matchup in the game. Renekton (lne 5) came out very nearly uncounterable:
    // a Warden is +1 into a Diver by the table and only +0.32 once his laning
    // shim had been subtracted. A tie-breaker between two champions of the same
    // archetype has to be worth a fraction of a counter, so it is clamped.
    const raw = (lane(mine) - lane(theirs)) * 0.03;
    return Math.max(-0.25, Math.min(0.25, raw));
}

/**
 * The full matchup number for one champion against another, in counter-steps.
 * 0 is even; positive favours `mine`. Nothing else in the game reads the
 * archetype table directly - everything goes through here.
 */
export function championMatchup(mine, theirs) {
    if (!mine || !theirs) return 0;
    const base = archetypeMatchup(mine.archetype, theirs.archetype);
    return Math.max(-2.5, Math.min(2.5, base + laneEdge(mine, theirs)));
}

/** Human label for a matchup number, for the champion select screen. */
export function matchupLabel(n) {
    const v = Number(n) || 0;
    if (v >= 1.5) return { text: 'Hard counter', tone: 'good' };
    if (v >= 0.5) return { text: 'Favoured', tone: 'good' };
    if (v > -0.5) return { text: 'Even', tone: 'flat' };
    if (v > -1.5) return { text: 'Losing lane', tone: 'bad' };
    return { text: 'Hard counter against you', tone: 'bad' };
}

// -------------------------------------------------------------------------
//  DETERMINISTIC RANDOM
//  Verbatim copies of teams.js's hash32/mulberry32. They are duplicated
//  rather than imported because this file's contract is "pure data, no
//  imports" -- and because teams.js may not import constants.js's own
//  consumers without a cycle. Anything seeded here must be a pure function
//  of its arguments: the meta below is regenerated on every page load and
//  mid-match, and would flicker if it were not.
// -------------------------------------------------------------------------
export function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// -------------------------------------------------------------------------
//  THE CHAMPION META
//  Every split, some champions are strong and some are not. This is a PURE
//  DERIVATION of (year, split): nothing about it is stored on the save, so a
//  reload, a page load and a match already in progress all agree, and a save
//  written before the meta existed needs no grandfathering at all.
//
//  Built PER ROLE, over the champions legal in that role, so every role has
//  strong AND weak picks every split -- a global tiering would routinely hand
//  one role five strong picks and another none, and the draft only ever offers
//  a player champions from their own role.
//
//  The step SIZE is deliberately NOT owned here. META_STEP_REF documents the
//  reference magnitude the tiering was sized against; match.js owns the live
//  constant, because it is the file careerSmoke's 7.6 mean-rating hard fail
//  actually measures. A meta tier is a SYMMETRIC term by construction -- the
//  strong band and the weak band are the same size, so across a career the
//  two cancel and the mean rating does not drift.
// -------------------------------------------------------------------------

/** Reference size of one meta step, documented here and owned by match.js. */
export const META_STEP_REF = 0.035;
/** Share of each role's pool that is strong this split. */
export const META_STRONG_FRACTION = 0.18;
/** Share of each role's pool that is weak this split. Equal to the strong
 *  share on purpose: the term has to be symmetric. */
export const META_WEAK_FRACTION = 0.18;

// 'year:split' -> frozen meta. Same idiom as teams._rosterCache: the meta is
// re-derived on every page load and read several times per match, and the
// derivation walks all 173 champions. Capped and cleared wholesale rather
// than evicted one by one -- a career touches two keys a year, so the cap is
// only ever reached by a harness sweeping decades.
const _META_CACHE = new Map();
const META_CACHE_MAX = 40;

/**
 * The meta for one split: { byId: {championId: -1|0|1}, strong: [ids], weak: [ids] }.
 *
 * A champion legal in two roles gets ONE tier, taken from the FIRST role it is
 * legal in, walking ROLES in declaration order (TOP, JNG, MID, ADC, SUP). One
 * champion id must map to exactly one tier -- `byId` is keyed by champion, and
 * a per-role tier would make metaTierFor() depend on which role asked, which
 * the draft and the dossier would then have to agree about forever. `strong`
 * and `weak` are derived from `byId` and therefore can never contradict it.
 */
export function metaFor(year, split) {
    const y = Math.floor(Number(year)) || 0;
    // Only two splits exist; anything else is rot and is read as spring, which
    // keeps the cache key set bounded as well as the answer deterministic.
    const s = String(split) === 'summer' ? 'summer' : 'spring';
    const key = y + ':' + s;

    const hit = _META_CACHE.get(key);
    if (hit) return hit;

    const byId = {};
    const strong = [];
    const weak = [];

    // ONE stream for the whole split, consumed in ROLES order with exactly one
    // draw per champion in CHAMPIONS order, so the stream advances identically
    // however the bands fall out.
    const rnd = mulberry32(hash32('meta:' + y + ':' + s));

    for (const role of ROLES) {
        const pool = championsForRole(role.id);
        const n = pool.length;
        if (!n) continue;

        const ranked = pool
            .map(c => ({ id: c.id, k: rnd() }))
            .sort((a, b) => (a.k - b.k) || (a.id < b.id ? -1 : 1));

        // At least one of each however small the pool, never more than half of
        // it in either band, and never both bands overlapping.
        const half = Math.max(1, Math.floor(n / 2));
        const nStrong = Math.min(half, Math.max(1, Math.round(n * META_STRONG_FRACTION)));
        let nWeak = Math.min(half, Math.max(1, Math.round(n * META_WEAK_FRACTION)));
        if (nStrong + nWeak > n) nWeak = Math.max(0, n - nStrong);

        for (let i = 0; i < ranked.length; i++) {
            const id = ranked[i].id;
            if (Object.prototype.hasOwnProperty.call(byId, id)) continue;  // first role wins
            const tier = i < nStrong ? 1 : (i >= n - nWeak ? -1 : 0);
            byId[id] = tier;
            if (tier === 1) strong.push(id);
            else if (tier === -1) weak.push(id);
        }
    }

    // Frozen because the object is memoised and handed to every caller: a
    // reader that wrote into it would poison the split for the session.
    const out = Object.freeze({
        byId: Object.freeze(byId),
        strong: Object.freeze(strong),
        weak: Object.freeze(weak),
    });

    if (_META_CACHE.size >= META_CACHE_MAX) _META_CACHE.clear();
    _META_CACHE.set(key, out);
    return out;
}

/**
 * 1 strong, -1 weak, 0 otherwise. Returns 0 and NEVER throws for an unknown,
 * dead or empty id: champion ids are permanent persisted save data, and a save
 * carrying an id this build no longer knows must simply read as contested
 * rather than break a match.
 */
export function metaTierFor(championId, year, split) {
    try {
        if (!championId || !CHAMPION_BY_ID[championId]) return 0;
        const t = metaFor(year, split).byId[championId];
        return t === 1 ? 1 : (t === -1 ? -1 : 0);
    } catch (e) {
        return 0;
    }
}

/** Human label for a meta tier, for champion select and the dossier. */
export function metaLabelFor(tier) {
    const t = Number(tier) || 0;
    if (t > 0) return 'Strong';
    if (t < 0) return 'Weak';
    return 'Contested';
}

// ─────────────────────────────────────────────────────────────────────────
//  CHAMPION PROFICIENCY
//  Games played on a champion, and what that is worth.
//
//  Proficiency is a PENALTY THAT FADES, not a bonus that accrues. Picking
//  something you have barely played costs you; mastering it removes the cost
//  and pays a little on top. That is deliberate on two counts. It is what makes
//  the three-option champion select an actual decision - the good matchup you
//  cannot play against the comfortable pick into a bad lane - and it keeps the
//  whole feature close to net-zero, which matters because careerSmoke fails a
//  run outright if the mean match rating drifts above 7.6.
// ─────────────────────────────────────────────────────────────────────────

/** Games on one champion to be considered fully proficient. */
export const PROFICIENCY_GAMES = 40;
/** Your signature pick is where the hours already went. */
export const PROFICIENCY_SIGNATURE_HEAD_START = 18;

/** 0..1 mastery from a raw game count, front-loaded: the first ten games teach
 *  you far more than the fortieth does. */
export function proficiency01(games) {
    const g = Math.max(0, Number(games) || 0);
    return Math.min(1, Math.sqrt(g / PROFICIENCY_GAMES));
}

export const PROFICIENCY_BANDS = [
    { min: 0.85, name: 'Mastered',   color: '#eab308' },
    { min: 0.60, name: 'Trusted',    color: '#22c55e' },
    { min: 0.35, name: 'Practised',  color: '#3b82f6' },
    { min: 0.12, name: 'Learning',   color: '#f59e0b' },
    { min: 0,    name: 'Cold',       color: '#ef4444' },
];

export function proficiencyBand(p) {
    const v = Math.max(0, Math.min(1, Number(p) || 0));
    for (const b of PROFICIENCY_BANDS) if (v >= b.min) return b;
    return PROFICIENCY_BANDS[PROFICIENCY_BANDS.length - 1];
}

/** Mean absolute distance between two {aggression, risk, teamplay} triples.
 *  The match engine scores every in-game decision with this same function. */
export function biasDistance(a, b) {
    if (!a || !b) return 0.5;
    const keys = ['aggression', 'risk', 'teamplay'];
    let sum = 0;
    for (const k of keys) {
        const x = Number(a[k]); const y = Number(b[k]);
        sum += Math.abs((Number.isFinite(x) ? x : 0.5) - (Number.isFinite(y) ? y : 0.5));
    }
    return sum / keys.length;
}

// A champion is "in your playstyle" when its archetype plays the way your
// identity plays. FIT_MAX is the distance that means it, and STYLE_POOL_MIN is
// the floor that stops a narrow style being left with nothing to pick.
//
// Both numbers are calibrated, not guessed:
//  - At 0.30 a Ganking Machine can pick 46 of 49 junglers, which is not a
//    constraint at all, so the threshold has to be tight.
//  - At 0.22 the Frontline Tank could not pick Ornn or Sion, which its own
//    blurb names, and all six top-lane Vanguards became unpickable in the role.
//    0.24 is the smallest value that fixes that; 0.25 additionally opened the
//    entire ADC pool to the Hypercarry style, which is not a constraint at all.
//  - Even at 0.25 the thinnest pools are jng_farm and jng_call: the jungle
//    simply does not contain many archetypes a Farming Jungler wants. Rather
//    than loosen the threshold for all twenty styles to rescue two, those pools
//    are topped up by nearest distance until STYLE_POOL_MIN is met.
//
// tools/championCheck.mjs asserts the floor holds for all twenty playstyles,
// that no champion is left unpickable, and that a style's blurb never names a
// champion the rule rejects.
//
// STYLE_POOL_MIN was raised from 8 to 12 to WIDEN THE DRAFT BANK: champion
// select offers three picks a game and the per-split meta now moves which of
// them are worth having, so a style whose whole bank is eight champions sees
// the same three names all season and has nothing to rotate into when its
// picks fall out of the meta. FIT_MAX stays at 0.24 -- the calibration above
// records why, and loosening the FIT threshold would widen the bank by letting
// in champions the playstyle does not actually play, which is a different and
// worse thing than topping the thin pools up by nearest distance.
export const FIT_MAX = 0.24;
export const STYLE_POOL_MIN = 12;

/** How well one champion suits one playstyle: 1 is identical, 0 is opposite. */
export function championFit(champ, playstyleId) {
    const style = PLAYSTYLE_BY_ID[playstyleId];
    const arche = champ && ARCHETYPE_BIAS[champ.archetype];
    if (!style || !arche) return 0;
    return Math.max(0, 1 - 2 * biasDistance(style.bias, arche));
}

/**
 * The champions a player of this role and playstyle may take as their signature
 * pick, nearest fit first. With no playstyle (or an unknown one) this is just
 * the role pool, so nothing is ever locked out by bad data.
 */
export function championsForStyle(roleId, playstyleId) {
    const pool = championsForRole(roleId);
    const style = PLAYSTYLE_BY_ID[playstyleId];
    if (!style || !pool.length) return pool;

    const distOf = (s, c) => (ARCHETYPE_BIAS[c.archetype]
        ? biasDistance(s.bias, ARCHETYPE_BIAS[c.archetype])
        : 1);

    const ranked = pool.map(c => ({ c, d: distOf(style, c) })).sort((a, b) => a.d - b.d);

    let cut = ranked.filter(r => r.d <= FIT_MAX).length;
    if (cut < STYLE_POOL_MIN) {
        // Top up by nearest distance, but never split an archetype across the
        // line: if one Specialist is legal, all of them are, or the player is
        // shown two identical champions with different answers.
        cut = Math.min(ranked.length, STYLE_POOL_MIN);
        while (cut < ranked.length && ranked[cut].d === ranked[cut - 1].d) cut++;
    }

    const taken = ranked.slice(0, cut);
    const have = new Set(taken.map(r => r.c.id));

    // Coverage guarantee. A champion that no playstyle fits WELL still belongs
    // to the one that fits it least badly — otherwise it is data in the game
    // that nobody can ever pick, which is precisely the silent kind of failure
    // this rule is supposed to avoid rather than create.
    const styles = PLAYSTYLES[roleId] || [];
    if (styles.length > 1) {
        for (const row of ranked) {
            if (have.has(row.c.id)) continue;
            let best = null, bestD = Infinity;
            for (const s of styles) {
                const sd = distOf(s, row.c);
                if (sd < bestD) { bestD = sd; best = s; }
            }
            if (best && best.id === style.id) { taken.push(row); have.add(row.c.id); }
        }
        taken.sort((a, b) => a.d - b.d);
    }

    return taken.map(r => r.c);
}

/** Whether a specific champion is a legal signature pick for a role+playstyle. */
export function championFitsStyle(championId, roleId, playstyleId) {
    if (!championId) return false;
    return championsForStyle(roleId, playstyleId).some(c => c.id === championId);
}

// ─────────────────────────────────────────────────────────────────────────
//  START PATHS
//  The two entry points the whole mode is built around.
//
//  Pre-Competitive starts at 13 with barely-there stats and no club. You get
//  unlimited training weeks (no schedule, no coach breathing down your neck)
//  and the highest potential ceiling in the game — but you have to earn a
//  contract by climbing solo queue and getting noticed. Grind it correctly and
//  you arrive at 16 stronger than any academy debutant.
//
//  Academy Debut starts at 16 already signed. Much higher base stats, income
//  from day one — but training is club-gated: limited sessions per week, and
//  you cannot train at all before you are signed to a club.
// ─────────────────────────────────────────────────────────────────────────
export const START_PATHS = [
    {
        id: 'precomp',
        name: 'Pre-Competitive',
        tag: 'Age 13 — unsigned',
        ages: [13, 14, 15],
        // The age your genetic trait shows itself. Late on purpose: a trait you
        // could see at creation is a trait players reroll a new career for.
        revealAge: 16,
        accent: '#22c55e',
        blurb: 'You are thirteen, you are nobody, and you have a computer. Grind solo queue, train whatever you like, and make somebody in a scouting office write your name down.',
        baseAttr: 33,          // mean starting attribute before every modifier
        spread: 7,             // per-attribute random spread
        potentialBase: 78,     // mean hidden ceiling
        potentialSpread: 9,
        potentialBonus: 8,     // the reward for starting early
        startGold: 250,
        startHype: 0,
        // Gold IV. Both paths start on the rank their own equilibrium holds --
        // see SOLOQ_FLOOR_MMR. Starting above it only produces a visible demotion
        // every fortnight for the first two months.
        startMMR: 1250,
        signed: false,
        trainingMult: 0.82,    // no coach, no facility — cheaper to do, worse per rep
        weeklyActions: 4,      // school and nothing else, so more free time
        perks: [
            'Train any attribute, any week, with no club schedule',
            'Highest potential ceiling in the mode (+8 average)',
            'One extra activity per week compared with a signed pro',
            'Free role changes until the day you sign',
        ],
        risks: [
            'Starting attributes are roughly 25 points below a debutant',
            'No salary — you live on stream tips and prize money',
            'Untrained soft cap of 72 until a club signs you',
            'If nobody scouts you before 18, the offers dry up fast',
        ],
    },
    {
        id: 'debut',
        name: 'Academy Debut',
        tag: 'Age 16 — signed',
        ages: [16, 17, 18],
        // Later than the pre-comp path: you arrived already formed, so it takes
        // longer for anyone to work out what you actually are.
        revealAge: 18,
        accent: '#f59e0b',
        blurb: 'Sixteen, contracted, and already on a roster. Somebody has decided you are worth a seat — now hold it. Training runs on the club’s schedule, not yours.',
        baseAttr: 57,
        spread: 5,
        potentialBase: 74,
        potentialSpread: 8,
        potentialBonus: 0,
        startGold: 1200,
        startHype: 400,
        startMMR: 1950,   // Platinum I, this path's own equilibrium
        signed: true,
        trainingMult: 1.00,
        weeklyActions: 3,
        perks: [
            'Starts roughly 24 attribute points ahead of a pre-comp prospect',
            'A salary, a coach, and real scrim blocks from week one',
            'Club facilities multiply every training session',
            'Immediate exposure — scouts already have your name',
        ],
        risks: [
            'Lower potential ceiling — you started developing later',
            'Training is limited to the club’s weekly sessions',
            'One fewer free activity per week',
            'Role changes are locked while you are under contract',
        ],
    },
];

export const PATH_BY_ID = START_PATHS.reduce((m, p) => { m[p.id] = p; return m; }, {});

// Choosing an older start inside a path is a straight trade: more ready now,
// less room to grow later.
export const AGE_TRADE = { attrPerYear: 4, potentialPerYear: -4 };

// ─────────────────────────────────────────────────────────────────────────
//  GENETIC TRAITS
//  Every career has exactly one, rolled and revealed on the birthday named by
//  its path's `revealAge` — never at creation. That is the whole point: a trait
//  you can see before you have invested three in-game years in a player is a
//  trait you reroll for, and rerolling is not a game.
//
//  A trait is the main thing in the mode that raises the roof. Its effects:
//    pot        flat potential added to EVERY attribute
//    potRole    extra potential on this role's key attributes (weight >= 0.14)
//    potKeys    extra potential on named attributes
//    trainMult  permanent multiplier on training gain
//    decayMult  multiplier on age decay (below 1 = you last longer)
//    earlyTrainMult / earlyUntilAge  a training penalty that expires with age
//
//  Because potential is what the ceiling reads, a trait bump goes straight into
//  player.potential rather than sitting beside it as a derived bonus. That keeps
//  one number as the truth for training, the UI, wages and market value alike.
//
//  IDS ARE PERMANENT. Saves store the bare id, exactly like player.champion, so
//  renaming or deleting one orphans every career that rolled it.
// ─────────────────────────────────────────────────────────────────────────
export const TRAIT_RARITIES = {
    common:    { id: 'common',    name: 'Common',    color: '#94a3b8' },
    uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#22c55e' },
    rare:      { id: 'rare',      name: 'Rare',      color: '#3b82f6' },
    legendary: { id: 'legendary', name: 'Legendary', color: '#eab308' },
};

export const TRAITS = [
    {
        id: 'grinder', name: 'Grinder', rarity: 'common', weight: 22,
        icon: '\u{1F513}', accent: '#94a3b8',
        blurb: 'Nothing came easily and nothing had to. You put the hours in and the hours pay.',
        effects: { pot: 2, trainMult: 1.06 },
    },
    {
        id: 'quick_study', name: 'Quick Study', rarity: 'common', weight: 20,
        icon: '\u{1F4D6}', accent: '#94a3b8',
        blurb: 'You are shown a thing once. The coaching staff notice inside a fortnight.',
        effects: { pot: 2, trainMult: 1.10 },
    },
    {
        id: 'late_bloomer', name: 'Late Bloomer', rarity: 'common', weight: 13,
        icon: '\u{1F331}', accent: '#94a3b8',
        blurb: 'Everything arrives two years after everyone told you it was too late. Then it keeps arriving.',
        effects: { pot: 6, earlyTrainMult: 0.80, earlyUntilAge: 20 },
    },
    {
        id: 'talented', name: 'Talented', rarity: 'uncommon', weight: 16,
        icon: '\u{2728}', accent: '#22c55e',
        blurb: 'Whatever your role is built on, you were built on it too. The rest is ordinary.',
        effects: { pot: 2, potRole: 4 },
    },
    {
        id: 'mastermind', name: 'Mastermind', rarity: 'uncommon', weight: 12,
        icon: '\u{1F9E0}', accent: '#22c55e',
        blurb: 'You read the game one beat before it happens and you can explain why, which is rarer.',
        effects: { pot: 3, potKeys: { knw: 7, map: 7, ldr: 7 } },
    },
    {
        id: 'ice_veins', name: 'Ice Veins', rarity: 'uncommon', weight: 9,
        icon: '\u{2744}', accent: '#22c55e',
        blurb: 'Game five plays exactly like game one. Nobody has ever seen your hands shake.',
        effects: { pot: 4, potKeys: { cmp: 8 } },
    },
    {
        id: 'iron_wrists', name: 'Iron Wrists', rarity: 'uncommon', weight: 8,
        icon: '\u{1F4AA}', accent: '#22c55e',
        blurb: 'The thing that ends most careers is not going to be the thing that ends yours.',
        effects: { pot: 4, decayMult: 0.70 },
    },
    {
        id: 'natural', name: 'Natural', rarity: 'rare', weight: 6,
        icon: '\u{1F31F}', accent: '#3b82f6',
        blurb: 'People who have watched a thousand prospects go quiet when they watch you.',
        effects: { pot: 7 },
    },
    {
        id: 'prodigy', name: 'Prodigy', rarity: 'rare', weight: 3.5,
        icon: '\u{1F52E}', accent: '#3b82f6',
        blurb: 'An academy coach writes one sentence in a report and three orgs ring him about it.',
        effects: { pot: 9, trainMult: 1.12 },
    },
    {
        id: 'legend', name: 'Legend', rarity: 'legendary', weight: 1.2,
        icon: '\u{1F451}', accent: '#eab308',
        blurb: 'One of these is born every few years. The region spends the next decade arguing about you.',
        effects: { pot: 12, trainMult: 1.15, decayMult: 0.75 },
    },
];

export const TRAIT_BY_ID = TRAITS.reduce((m, t) => { m[t.id] = t; return m; }, {});

// The attribute weight above which an attribute counts as "key" for a role, and
// therefore gets a trait's potRole bonus. ROLES weights run 0.02 to 0.24.
export const ROLE_KEY_ATTR_WEIGHT = 0.14;

// ─────────────────────────────────────────────────────────────────────────
//  CALENDAR
//  40 weeks per competitive year. Week 40 rolls over into the next year and
//  ages the player by one.
// ─────────────────────────────────────────────────────────────────────────
export const WEEKS_PER_YEAR = 40;

export const PHASES = [
    { id: 'preseason', name: 'Preseason',        short: 'PRE', from: 1,  to: 1,  accent: '#64748b', desc: 'Rosters lock, bootcamps run, nothing counts yet.' },
    // FIRST STAND takes the tail of preseason rather than a slot in mid-season,
    // and that is both the safe choice and the accurate one: the real tournament
    // runs in March, at the very top of the year, before the splits have decided
    // anything. Carving it out of weeks 2-4 means NO phase after week 4 moves,
    // so no existing save wakes up inside a different phase than it went to
    // sleep in. The field is the reigning champion of each region, which is the
    // closest thing this calendar has to "the winners of the first splits".
    { id: 'first_stand', name: 'First Stand',    short: 'FST', from: 2,  to: 4,  accent: '#f472b6', desc: 'Six champions, one week of the year that belongs to nobody else.' },
    { id: 'spring',    name: 'Spring Split',     short: 'SPR', from: 5,  to: 13, accent: '#22c55e', desc: 'Nine weeks of regular season. Two games a week.' },
    { id: 'spring_po', name: 'Spring Playoffs',  short: 'SPO', from: 14, to: 16, accent: '#3b82f6', desc: 'Top six. Best-of-five, double elimination.' },
    { id: 'msi',       name: 'Mid-Season Invitational', short: 'MSI', from: 17, to: 19, accent: '#2dd4bf', desc: 'The first international test of the year.' },
    { id: 'summer',    name: 'Summer Split',     short: 'SUM', from: 20, to: 28, accent: '#f59e0b', desc: 'Championship points on the line every single game.' },
    { id: 'summer_po', name: 'Summer Playoffs',  short: 'SPO', from: 29, to: 31, accent: '#f97316', desc: 'Win it and you are going to Worlds.' },
    { id: 'worlds',    name: 'World Championship', short: 'WLD', from: 32, to: 35, accent: '#eab308', desc: 'Sixteen teams. One trophy. Everything you have worked for.' },
    { id: 'offseason', name: 'Offseason',        short: 'OFF', from: 36, to: 40, accent: '#a855f7', desc: 'Contracts, transfers, role changes and rest.' },
];

export function phaseForWeek(week) {
    const w = Math.max(1, Math.min(WEEKS_PER_YEAR, Math.floor(week) || 1));
    return PHASES.find(p => w >= p.from && w <= p.to) || PHASES[0];
}

/** Which split a calendar week belongs to. Preseason is spring's build-up;
 *  everything from MSI onward is booked against summer.
 *
 *  Lifted VERBATIM out of engine.js, where it was private, because the meta
 *  above is keyed by (year, split) and match.js must be able to ask which
 *  split a week is in without importing the engine (match.js importing
 *  engine.js is a cycle -- engine.js already imports match.js).
 *
 *  `first_stand` is deliberately absent from the table, exactly as it was in
 *  engine.js: weeks 2-4 fall through to the 'spring' default, which is the
 *  same answer preseason gives and the same answer this function has always
 *  given. Do not "complete" the table -- it would change what split a First
 *  Stand week books against. */
const SPLIT_BY_PHASE = {
    preseason: 'spring', spring: 'spring', spring_po: 'spring',
    msi: 'summer', summer: 'summer', summer_po: 'summer',
    worlds: 'summer', offseason: 'summer',
};

export function splitForWeek(week) {
    return SPLIT_BY_PHASE[phaseForWeek(week).id] || 'spring';
}

// Regular-season weeks play two matches; playoff/international weeks play a series.
export const MATCHES_PER_REG_WEEK = 2;
export const REG_SPLIT_WEEKS = 9;   // spring and summer are both 9 weeks

// ─────────────────────────────────────────────────────────────────────────
//  WEEKLY ACTIVITIES
//  Each week you spend a fixed number of activity slots. Everything except
//  Rest costs energy; Rest gives it back.
// ─────────────────────────────────────────────────────────────────────────
export const ACTIVITIES = [
    {
        id: 'train', name: 'Training Drill', icon: '\u{1F3AF}', accent: '#3b82f6', energy: 24,
        desc: 'Run a drill and raise one attribute. This is the only thing that permanently moves your rating.',
        needsClub: false, group: 'practice',
    },
    {
        id: 'soloq', name: 'Solo Queue', icon: '\u{1F3AE}', accent: '#22c55e', energy: 18,
        desc: 'Grind the ladder. Small all-round gains, ranked progress and a trickle of followers. A losing night costs morale, and queueing again in the same week costs health.',
        needsClub: false, group: 'practice',
    },
    {
        id: 'scrim', name: 'Scrim Block', icon: '\u{2694}', accent: '#f59e0b', energy: 22,
        desc: 'Practise with the roster. Builds teamfighting, shotcalling and team chemistry, and sharpens your four team-mates for good, up to a limit.',
        needsClub: true, group: 'practice',
    },
    // Champion practice. The only activity that touches player.proficiency
    // rather than an attribute: it banks games on ONE champion in your pool,
    // which is what makes a cold pick warm before the meta rewards it. Cheap
    // in energy because it competes with training for a slot, not with rest.
    // The handler lives in engine.js.
    {
        id: 'champ_lab', name: 'Champion Practice', icon: '\u{1F9EA}', accent: '#f472b6', energy: 12,
        desc: 'Hours in a custom game on one champion from your pool. Banks games on your practice champion, and nothing else.',
        needsClub: false, group: 'practice',
    },
    {
        id: 'vod', name: 'VOD Review', icon: '\u{1F4FC}', accent: '#a855f7', energy: 10,
        desc: 'Study replays. Cheap, reliable game knowledge and map awareness.',
        needsClub: false, group: 'practice',
    },
    {
        id: 'stream', name: 'Stream', icon: '\u{1F3A5}', accent: '#ec4899', energy: 15,
        desc: 'Go live. Gold and followers now, at the cost of practice time.',
        needsClub: false, group: 'business',
    },
    {
        id: 'media', name: 'Media & Content', icon: '\u{1F4F0}', accent: '#22d3ee', energy: 8,
        desc: 'Interviews, photoshoots, a podcast nobody asked for. Hype up, morale volatile.',
        needsClub: false, group: 'business',
    },
    {
        id: 'gym', name: 'Gym & Physio', icon: '\u{1F9BE}', accent: '#14b8a6', energy: 12,
        desc: 'Wrists, back, sleep. Repairs health and lowers injury risk for weeks to come.',
        needsClub: false, group: 'body',
    },
    {
        id: 'rest', name: 'Rest Day', icon: '\u{1F634}', accent: '#64748b', energy: -50,
        desc: 'Do nothing on purpose. Restores energy and morale, and nothing else.',
        needsClub: false, group: 'body',
    },

    // ── Condition ────────────────────────────────────────────────────────
    // Before these, Rest Day was the only morale option AND the only energy
    // option, so it was never a choice; and the Gym was the only health one.
    // Nothing on the board was a decision between morale and health.
    //
    // `once` is per week and needs weekly.did; `gold` is spent AFTER the slot
    // and BEFORE the energy, and a failed spend must bail (see doActivity).
    {
        id: 'friends', name: 'Day Off With Friends', icon: '\u{1F37B}', accent: '#f472b6', energy: -20,
        gold: 120, once: true, group: 'body',
        desc: 'People who do not care what your KDA was. Restores morale properly, and some energy with it.',
        needsClub: false,
    },
    {
        id: 'therapy', name: 'Sports Psychologist', icon: '\u{1F9E0}', accent: '#a78bfa', energy: 6,
        gold: 450, once: true, minAge: 15, group: 'body',
        desc: 'An hour with someone whose job is the part of this that is not mechanics. The reliable way out of a bad run.',
        needsClub: false,
    },
    {
        id: 'recover', name: 'Recovery Week', icon: '\u{1FA79}', accent: '#2dd4bf', energy: -35,
        once: true, group: 'body',
        desc: 'Physio, sleep, no scrims. Repairs real damage at the cost of match sharpness.',
        needsClub: false,
        // Only offered when it would actually do something. Shown DISABLED with
        // this reason rather than hidden — a button nobody has ever seen is a
        // button nobody finds when they need it.
        when: (c) => (Number(c?.player?.health) || 100) < 70
            || (Number(c?.flags?.burnout?.weeks) || 0) > 0,
        whenReason: 'For when you are carrying an injury or burning out.',
    },

    // ── Business ─────────────────────────────────────────────────────────
    {
        id: 'fans', name: 'Fan Event', icon: '\u{1F44B}', accent: '#fb923c', energy: 10,
        minAge: 14, group: 'business',
        desc: 'A signing queue and a room that likes you. Reliable followers and a lift, where Media is a coin flip.',
        needsClub: false,
    },
    {
        id: 'sponsorday', name: 'Sponsor Day', icon: '\u{1F4BC}', accent: '#eab308', energy: 12,
        minAge: 16, once: true, group: 'business',
        desc: 'A shoot, a stack of cards to sign, and a cheque. Nobody enjoys it.',
        needsClub: false,
    },
    {
        id: 'coach1on1', name: 'One-on-One With The Coach', icon: '\u{1F5E3}', accent: '#60a5fa', energy: 8,
        once: true, group: 'practice',
        desc: 'Your VODs, their notes, an hour of being told the truth. Buys real standing in the room.',
        needsClub: true,
    },
    // The only activity that buys nothing on the attribute sheet: it opens
    // REGIONS. Priced in the business group rather than practice because that
    // is what it competes with -- a lesson is a week you did not stream.
    //
    // The icon is BOOKS, not the speaking head: coach1on1 already owns that one
    // and two identical glyphs in one list is a button nobody can find.
    {
        id: 'language', name: 'Language Lessons', icon: '\u{1F4DA}', accent: '#818cf8', energy: 10,
        gold: 180, group: 'business',
        desc: 'Sit down with a tutor. The circuit is six regions and you can only sign where you can talk.',
        needsClub: false,
        when: (c) => !!studyTargetFor(c),
        whenReason: 'You already speak every language on the circuit.',
    },
];

export const ACTIVITY_BY_ID = ACTIVITIES.reduce((m, a) => { m[a.id] = a; return m; }, {});

/** Sixteen activities against a three-slot week is too many undifferentiated
 *  buttons, so the Hub renders them in labelled sections. Order is the order
 *  they appear on screen. */
export const ACTIVITY_GROUPS = [
    { id: 'practice', name: 'Practice',  blurb: 'Where rating comes from.' },
    { id: 'body',     name: 'Condition', blurb: 'Energy, health, and wanting to be here.' },
    { id: 'business', name: 'Business',  blurb: 'Money, followers, and the parts of the job that are not the game.' },
];

export const ENERGY_MAX = 100;
export const HEALTH_MAX = 100;
export const FORM_MAX = 100;
export const MORALE_MAX = 100;

// ─────────────────────────────────────────────────────────────────────────
//  SOLO QUEUE LADDER
//  Used by the pre-competitive path as the visible measure of "am I good yet",
//  and by scouts as a gate on contract offers.
// ─────────────────────────────────────────────────────────────────────────
export const RANK_TIERS = [
    { id: 'IRON',        name: 'Iron',        color: '#6b5b4f', divisions: 4, floorMMR: 0    },
    { id: 'BRONZE',      name: 'Bronze',      color: '#b0835c', divisions: 4, floorMMR: 400  },
    { id: 'SILVER',      name: 'Silver',      color: '#94a3b8', divisions: 4, floorMMR: 800  },
    { id: 'GOLD',        name: 'Gold',        color: '#eab308', divisions: 4, floorMMR: 1200 },
    { id: 'PLATINUM',    name: 'Platinum',    color: '#10b981', divisions: 4, floorMMR: 1600 },
    { id: 'EMERALD',     name: 'Emerald',     color: '#34d399', divisions: 4, floorMMR: 2000 },
    { id: 'DIAMOND',     name: 'Diamond',     color: '#3b82f6', divisions: 4, floorMMR: 2400 },
    { id: 'MASTER',      name: 'Master',      color: '#a855f7', divisions: 1, floorMMR: 2850 },
    { id: 'GRANDMASTER', name: 'Grandmaster', color: '#ef4444', divisions: 1, floorMMR: 3150 },
    { id: 'CHALLENGER',  name: 'Challenger',  color: '#f59e0b', divisions: 1, floorMMR: 3450 },
];

export const MMR_MAX = 4000;

// ─────────────────────────────────────────────────────────────────────────
//  WHERE SOLO QUEUE SETTLES
//  doSoloQueue() drifts the player toward a target derived from OVR, and that
//  target — not the starting number — is what a career's rank actually is.
//  It used to be `(ovr - 35) * 62` floored at 300, so a fresh 33-OVR prospect
//  targeted Iron I: the career started in Bronze and DEMOTED its way down to
//  Iron over its first six ranked weeks, then sat there until OVR 54.
//
//  Two segments now, joined at OVR 74. Above the joint nothing changes at all —
//  which is the point: SCOUT_MMR_GATE, Master/Grandmaster/Challenger and the
//  ms_challenger milestone all live up there and must not move. Below it the
//  line runs from Gold IV at a fresh prospect's rating up to the joint.
//
//  IRON, BRONZE and SILVER are now legacy tiers, reachable only by an old save
//  or a run of bad event rolls. Do NOT delete them — rankFromMMR() is called on
//  peakMMR values published by OTHER PEOPLE'S board documents.
export const SOLOQ_FLOOR_MMR = RANK_TIERS.find(t => t.id === 'GOLD').floorMMR;  // 1200
export const SOLOQ_FLOOR_OVR = 32;    // a freshly created pre-competitive prospect
export const SOLOQ_JOINT_OVR = 74;    // above this the old curve is untouched

/** The MMR an OVR settles at. Continuous at the joint by construction. */
export function soloTargetFor(ovr) {
    const v = Number(ovr) || 0;
    const hiAt = (o) => (o - 35) * 62;
    if (v >= SOLOQ_JOINT_OVR) return Math.min(MMR_MAX, hiAt(v));
    const slope = (hiAt(SOLOQ_JOINT_OVR) - SOLOQ_FLOOR_MMR) / (SOLOQ_JOINT_OVR - SOLOQ_FLOOR_OVR);
    return Math.max(SOLOQ_FLOOR_MMR, Math.min(MMR_MAX, SOLOQ_FLOOR_MMR + (v - SOLOQ_FLOOR_OVR) * slope));
}

// ─────────────────────────────────────────────────────────────────────────
//  CLUB TIERS
//  Tier 3 is where a pre-comp prospect starts (amateur / open circuit),
//  tier 2 is academy & challengers, tier 1 is the main league.
// ─────────────────────────────────────────────────────────────────────────
export const CLUB_TIERS = {
    1: { id: 1, name: 'Main League',   short: 'T1', accent: '#eab308', salaryMult: 1.00, trainingMult: 1.25, prestige: 3 },
    2: { id: 2, name: 'Academy',       short: 'T2', accent: '#3b82f6', salaryMult: 0.22, trainingMult: 1.10, prestige: 2 },
    3: { id: 3, name: 'Amateur',       short: 'T3', accent: '#64748b', salaryMult: 0.05, trainingMult: 0.95, prestige: 1 },
};

// The rating a club of each tier can still plausibly house. `prestige` above
// has never had a reader; this is the number that actually does something:
// contracts.js refuses a club that is beneath the player, so an 80-OVR starter
// stops being called by amateur sides that could never field him.
//
// Sized against the unsigned prospect, not against the league table.
// UNSIGNED_SOFT_CAP is 72 and environmentCap() is a 0.15x THROTTLE rather than
// a wall, so an unsigned player genuinely drifts past 72 given enough weeks --
// the tier-3 ceiling therefore has to sit CLEARLY above anything an unsigned
// player could plausibly reach, or the amateur circuit would stop calling the
// very prospects it exists to sign and the compulsory first-club ladder (which
// careerSmoke hard-fails a run for missing) would have nobody left to run
// through. 78 is that clearance. Tier 2 at 84 leaves academies the whole band
// between a good prospect and a main-league starter, and tier 1 at 99 is not a
// gate at all -- it is written out so the table has no missing key and nothing
// has to guess a default.
export const TIER_OVR_CEILING = { 1: 99, 2: 84, 3: 78 };

// Weekly club training sessions by tier — the debut path's main constraint.
export const CLUB_TRAINING_SLOTS = { 1: 3, 2: 2, 3: 1 };

// ─────────────────────────────────────────────────────────────────────────
//  AGE GATES
//  Rating was the only thing standing between a thirteen-year-old and a
//  main-league roster, and rating is reachable young: signing ANY club — an
//  amateur Discord stack included — makes environmentCap() return ATTR_MAX, so
//  the unsigned soft cap stops throttling the moment a prospect is on a roster.
//  A well-trained fifteen-year-old could clear the 66 eligibility bar.
//
//  Keyed per tier rather than one MAIN_LEAGUE_MIN_AGE so "academies from 14"
//  later is a single literal. Read them with Number() — team.tier arrives as a
//  string on a rotted save and a string key is a silent pass.
//
//  These gate SIGNING and PROMOTION, never STAYING: a save where a fifteen-year
//  -old already holds a tier-1 seat is grandfathered. A gate that released them
//  would destroy an in-progress career on load.
export const MIN_AGE_BY_TIER = { 1: 16, 2: 13, 3: 13 };

/** Worlds and MSI only. The domestic playoff bracket is deliberately NOT gated:
 *  "major tournaments" reads as the internationals, and pulling a fifteen-year
 *  -old academy starter out of his own league's postseason is not what was
 *  asked for. Do not "finish" this gate by adding runPlayoffs(). */
export const MIN_AGE_INTERNATIONAL = 17;

// Attribute soft cap while unsigned. Above this, training gains are throttled
// hard: you genuinely need a professional environment to get to the top.
export const UNSIGNED_SOFT_CAP = 72;

// ─────────────────────────────────────────────────────────────────────────
//  LEAGUES
//  Ten main-league orgs and eight academy sides per region, drawn from the
//  same org names as the card database so career mode and roster mode share
//  a world. `strength` is the baseline team power the match engine starts from.
// ─────────────────────────────────────────────────────────────────────────
function t1(id, name, strength, accent) { return { id, name, tier: 1, strength, accent }; }
function t2(id, name, strength, accent) { return { id, name, tier: 2, strength, accent }; }
function t3(id, name, strength, accent) { return { id, name, tier: 3, strength, accent }; }

export const LEAGUES = {
    LCK: {
        tier1: [
            t1('lck_t1',   'T1',                88, '#e2012d'),
            t1('lck_geng', 'Gen.G',             87, '#aa8a00'),
            t1('lck_hle',  'Hanwha Life',       85, '#ff6b01'),
            t1('lck_dk',   'Dplus KIA',         83, '#0f6f4c'),
            t1('lck_kt',   'KT Rolster',        81, '#ff0a0a'),
            t1('lck_bfx',  'BNK FearX',         77, '#00b2a9'),
            t1('lck_ns',   'Nongshim RedForce', 75, '#d31145'),
            t1('lck_drx',  'DRX',               73, '#5383e8'),
            t1('lck_dns',  'DN Freecs',         71, '#0b6cb8'),
            t1('lck_bro',  'OKSavingsBank BRION', 68, '#00a3e0'),
        ],
        tier2: [
            t2('lck_t1a',   'T1 Academy',        70, '#e2012d'),
            t2('lck_genga', 'Gen.G Global Academy', 69, '#aa8a00'),
            t2('lck_hlea',  'Hanwha Life Challengers', 67, '#ff6b01'),
            t2('lck_dka',   'Dplus KIA Challengers', 66, '#0f6f4c'),
            t2('lck_kta',   'KT Rolster Challengers', 64, '#ff0a0a'),
            t2('lck_bfxa',  'BNK FearX Youth',   62, '#00b2a9'),
            t2('lck_nsa',   'Nongshim Challengers', 60, '#d31145'),
            t2('lck_drxa',  'DRX Challengers',   58, '#5383e8'),
        ],
    },
    LPL: {
        tier1: [
            t1('lpl_blg', 'Bilibili Gaming',  88, '#1e5bc6'),
            t1('lpl_jdg', 'JD Gaming',        85, '#c8102e'),
            t1('lpl_tes', 'Top Esports',      84, '#e60012'),
            t1('lpl_wbg', 'Weibo Gaming',     82, '#d7000f'),
            t1('lpl_lng', 'LNG Esports',      80, '#00a0e9'),
            t1('lpl_al',  'Anyone’s Legend', 79, '#f5a800'),
            t1('lpl_ig',  'Invictus Gaming',  76, '#0a1e3c'),
            t1('lpl_edg', 'Edward Gaming',    74, '#000000'),
            t1('lpl_fpx', 'FunPlus Phoenix',  72, '#e4002b'),
            t1('lpl_omg', 'Oh My God',        69, '#ff6600'),
        ],
        tier2: [
            t2('lpl_blga', 'BLG Junior',      70, '#1e5bc6'),
            t2('lpl_jdga', 'JDG Young',       69, '#c8102e'),
            t2('lpl_tesa', 'TES Challenger',  67, '#e60012'),
            t2('lpl_wbga', 'WBG Youth',       65, '#d7000f'),
            t2('lpl_lnga', 'LNG Academy',     63, '#00a0e9'),
            t2('lpl_iga',  'IG Young',        61, '#0a1e3c'),
            t2('lpl_edga', 'EDG Youth',       59, '#000000'),
            t2('lpl_fpxa', 'FPX Blaze',       57, '#e4002b'),
        ],
    },
    LEC: {
        tier1: [
            t1('lec_g2',   'G2 Esports',      86, '#ee3a43'),
            t1('lec_fnc',  'Fnatic',          83, '#ff5900'),
            t1('lec_mkoi', 'Movistar KOI',    82, '#8a2be2'),
            t1('lec_th',   'Team Heretics',   79, '#ffcc00'),
            t1('lec_bds',  'Team BDS',        77, '#e4002b'),
            t1('lec_vit',  'Team Vitality',   76, '#ffdd00'),
            t1('lec_kc',   'Karmine Corp',    75, '#00b2ff'),
            t1('lec_sk',   'SK Gaming',       72, '#003ba4'),
            t1('lec_gx',   'GiantX',          70, '#f26522'),
            t1('lec_navi', 'Natus Vincere',   67, '#ffe600'),
        ],
        tier2: [
            t2('lec_kcb',  'Karmine Corp Blue', 69, '#00b2ff'),
            t2('lec_ldlc', 'LDLC OL',         67, '#0066b3'),
            t2('lec_fnctq','Fnatic TQ',       66, '#ff5900'),
            t2('lec_koif', 'KOI Fenix',       64, '#8a2be2'),
            t2('lec_bkr',  'BK ROG',          62, '#c8102e'),
            t2('lec_vitb', 'Vitality.Bee',    60, '#ffdd00'),
            t2('lec_skp',  'SK Gaming Prime', 58, '#003ba4'),
            t2('lec_los',  'Los Heretics',    56, '#ffcc00'),
        ],
    },
    LCS: {
        tier1: [
            t1('lcs_c9',   'Cloud9',          82, '#00a8e0'),
            t1('lcs_tl',   'Team Liquid',     81, '#0a1e3c'),
            t1('lcs_fly',  'FlyQuest',        79, '#3bb143'),
            t1('lcs_100t', '100 Thieves',     77, '#e4002b'),
            t1('lcs_nrg',  'NRG',             75, '#000000'),
            t1('lcs_sr',   'Shopify Rebellion', 73, '#95bf47'),
            t1('lcs_dig',  'Dignitas',        70, '#ffcc00'),
            t1('lcs_lyon', 'LYON',            68, '#ff4d6d'),
            t1('lcs_dsg',  'Disguised',       66, '#7c3aed'),
            t1('lcs_imt',  'Immortals',       64, '#00a1e0'),
        ],
        tier2: [
            t2('lcs_c9a',  'Cloud9 Challengers', 63, '#00a8e0'),
            t2('lcs_tla',  'Liquid Challengers', 62, '#0a1e3c'),
            t2('lcs_flya', 'FlyQuest Challengers', 60, '#3bb143'),
            t2('lcs_100ta','100 Thieves Next', 59, '#e4002b'),
            t2('lcs_nrga', 'NRG Academy',     57, '#000000'),
            t2('lcs_diga', 'Dignitas Academy', 55, '#ffcc00'),
            t2('lcs_maver','Maryville Saints', 53, '#c8102e'),
            t2('lcs_shd',  'Shadow Academy',  51, '#475569'),
        ],
    },
    LCP: {
        tier1: [
            t1('lcp_cfo',  'CTBC Flying Oyster', 80, '#00a9a5'),
            t1('lcp_psg',  'PSG Talon',       78, '#e30613'),
            t1('lcp_gam',  'GAM Esports',     76, '#f5a800'),
            t1('lcp_tsw',  'Team Secret Whales', 74, '#00b2ff'),
            t1('lcp_dfm',  'DetonatioN FocusMe', 72, '#e60012'),
            t1('lcp_mvke', 'MGN Vikings',     70, '#1f4e79'),
            t1('lcp_shg',  'SoftBank Hawks',  68, '#f5a800'),
            t1('lcp_bru',  'Burning Core',    65, '#ff6600'),
            t1('lcp_dcg',  'DetonatioN Gaming Blue', 63, '#0a1e3c'),
            t1('lcp_tw',   'Talon White',     61, '#8a2be2'),
        ],
        tier2: [
            t2('lcp_cfoa', 'CFO Academy',     58, '#00a9a5'),
            t2('lcp_psga', 'PSG Talon Youth', 57, '#e30613'),
            t2('lcp_gama', 'GAM Junior',      55, '#f5a800'),
            t2('lcp_tswa', 'Secret Whales Blue', 54, '#00b2ff'),
            t2('lcp_dfma', 'DFM Rise',        52, '#e60012'),
            t2('lcp_shga', 'Hawks Academy',   50, '#f5a800'),
            t2('lcp_brua', 'Burning Core Toyama', 48, '#ff6600'),
            t2('lcp_twa',  'Talon Blue',      46, '#8a2be2'),
        ],
    },
    // The weakest main league in the mode by design — its best side is softer
    // than the LCP's, which is what makes Brazil the region you can win at home
    // and then get taken apart on an international stage.
    CBLOL: {
        // Ordered on the 2026 season and on the roster means of this project's own
        // 2026 cards, which agree: LOS 86.0, LOUD 85.0, FUR 81.5, VKS 81.2,
        // RED 78.8, paiN 77.4, FXW 75.6, LEV 73.6. paiN are the most decorated
        // org in the league's history and are having a bad year; the static table
        // owns the pecking order the season opens on, so it follows the form.
        tier1: [
            t1('cblol_loud', 'LOUD',                76, '#00e701'),
            t1('cblol_los',  'Los Grandes',         74, '#fbbf24'),
            t1('cblol_fur',  'FURIA',               72, '#111827'),
            t1('cblol_vks',  'Vivo Keyd Stars',     71, '#8b5cf6'),
            t1('cblol_red',  'RED Canids Kalunga',  70, '#d10a11'),
            t1('cblol_pain', 'paiN Gaming',         69, '#e4002b'),
            t1('cblol_fxw',  'Fluxo W7M',           66, '#1e6bff'),
            t1('cblol_lev',  'Leviatán',            64, '#0abfbc'),
            t1('cblol_kbm',  'KaBuM! Esports',      62, '#ff6a00'),
            t1('cblol_intz', 'INTZ',                59, '#e11d48'),
        ],
        tier2: [
            t2('cblol_louda', 'LOUD Academy',       56, '#00e701'),
            t2('cblol_paina', 'paiN Academy',       54, '#e4002b'),
            t2('cblol_reda',  'RED Canids Academy', 52, '#d10a11'),
            t2('cblol_fura',  'FURIA Academy',      51, '#111827'),
            t2('cblol_vksa',  'VKS Academy',        49, '#8b5cf6'),
            t2('cblol_losa',  'Los Grandes Academy', 47, '#fbbf24'),
            t2('cblol_kbma',  'KaBuM! Academy',     45, '#ff6a00'),
            t2('cblol_intza', 'INTZ Academy',       43, '#e11d48'),
        ],
    },
};

// Amateur / open circuit — where an unsigned pre-comp player scrims. These are
// shared across regions and are deliberately generic.
export const AMATEUR_TEAMS = [
    t3('am_pug1', 'Solo Queue Five',   38, '#64748b'),
    t3('am_pug2', 'Discord Stack',     42, '#5865f2'),
    t3('am_pug3', 'PC Bang Regulars',  46, '#22c55e'),
    t3('am_pug4', 'University Squad',  50, '#3b82f6'),
    t3('am_pug5', 'Open Qualifier Team', 54, '#a855f7'),
    t3('am_pug6', 'Tier Two Hopefuls', 58, '#f59e0b'),
];

export function allTeams() {
    const out = [];
    for (const rid of REGION_IDS) {
        const L = LEAGUES[rid];
        if (!L) continue;
        for (const t of L.tier1) out.push({ ...t, region: rid });
        for (const t of L.tier2) out.push({ ...t, region: rid });
    }
    for (const t of AMATEUR_TEAMS) out.push({ ...t, region: 'ALL' });
    return out;
}

const _TEAM_INDEX = allTeams().reduce((m, t) => { m[t.id] = t; return m; }, {});
export function teamById(id) { return _TEAM_INDEX[id] || null; }

// ─────────────────────────────────────────────────────────────────────────
//  SQUAD STATUS
// ─────────────────────────────────────────────────────────────────────────
//  `moraleTarget` is where sitting in this seat pulls your morale, and
//  `moralePull` is the most it may move in one week. A PULL, never a flat
//  subtraction: a benched player converges on 34 and stops there, where a flat
//  -4 a week would take him to zero in nine weeks and hold him there for ever.
//  That distinction is the whole difference between pressure and a trap, and it
//  matters more now that burnout reads the same meter.
//
//  This replaces a `moraleDrift` field that was declared here and read by
//  NOTHING in the entire mode — repurposing it was safe for exactly that reason.
//  Do NOT rename a status ID: those are persisted on the save like champion and
//  trait ids. The fields inside are free.
export const SQUAD_STATUS = {
    star:     { id: 'star',     name: 'Franchise Player', accent: '#eab308', playChance: 1.00, moraleTarget: 72, moralePull: 3 },
    starter:  { id: 'starter',  name: 'Starter',          accent: '#22c55e', playChance: 0.95, moraleTarget: 62, moralePull: 3 },
    rotation: { id: 'rotation', name: 'Rotation',         accent: '#3b82f6', playChance: 0.55, moraleTarget: 52, moralePull: 3 },
    sub:      { id: 'sub',      name: 'Substitute',       accent: '#f59e0b', playChance: 0.20, moraleTarget: 44, moralePull: 3 },
    benched:  { id: 'benched',  name: 'Benched',          accent: '#ef4444', playChance: 0.05, moraleTarget: 34, moralePull: 3 },
};

// ─────────────────────────────────────────────────────────────────────────
//  NEWS / FEED
// ─────────────────────────────────────────────────────────────────────────
export const NEWS_TYPES = {
    match:    { accent: '#3b82f6', label: 'Match'    },
    training: { accent: '#22c55e', label: 'Training' },
    transfer: { accent: '#a855f7', label: 'Transfer' },
    award:    { accent: '#eab308', label: 'Award'    },
    money:    { accent: '#14b8a6', label: 'Money'    },
    drama:    { accent: '#ef4444', label: 'Drama'    },
    social:   { accent: '#ec4899', label: 'Social'   },
    system:   { accent: '#64748b', label: 'Career'   },
};

// ─────────────────────────────────────────────────────────────────────────
//  AGE CURVE
//  Growth multiplier applied to every training gain, and the yearly decay that
//  starts eating veterans.
// ─────────────────────────────────────────────────────────────────────────
export const AGE_CURVE = [
    { age: 13, growth: 1.60, decay: 0 },
    { age: 14, growth: 1.55, decay: 0 },
    { age: 15, growth: 1.50, decay: 0 },
    { age: 16, growth: 1.42, decay: 0 },
    { age: 17, growth: 1.34, decay: 0 },
    { age: 18, growth: 1.26, decay: 0 },
    { age: 19, growth: 1.18, decay: 0 },
    { age: 20, growth: 1.10, decay: 0 },
    { age: 21, growth: 1.02, decay: 0 },
    { age: 22, growth: 0.92, decay: 0 },
    { age: 23, growth: 0.82, decay: 0 },
    { age: 24, growth: 0.72, decay: 0 },
    { age: 25, growth: 0.62, decay: 0.4 },
    { age: 26, growth: 0.52, decay: 0.8 },
    { age: 27, growth: 0.42, decay: 1.3 },
    { age: 28, growth: 0.34, decay: 1.9 },
    { age: 29, growth: 0.26, decay: 2.5 },
    { age: 30, growth: 0.20, decay: 3.2 },
    { age: 31, growth: 0.15, decay: 4.0 },
    { age: 32, growth: 0.10, decay: 4.8 },
    { age: 33, growth: 0.08, decay: 5.6 },
    { age: 34, growth: 0.06, decay: 6.5 },
    { age: 35, growth: 0.04, decay: 7.5 },
];

export const RETIREMENT_AGE_MIN = 24;   // earliest a player may voluntarily retire
export const RETIREMENT_AGE_FORCED = 38;

// ─────────────────────────────────────────────────────────────────────────
//  MISC
// ─────────────────────────────────────────────────────────────────────────
export const DEFAULT_START_YEAR = 2026;

// Every career screen id, in nav order. CareerShell routes on these.
export const CAREER_SCREENS = [
    { id: 'hub',       name: 'Hub',       icon: '\u{1F3E0}' },
    { id: 'training',  name: 'Training',  icon: '\u{1F3AF}' },
    { id: 'club',      name: 'Club',      icon: '\u{1F6E1}' },
    { id: 'calendar',  name: 'Season',    icon: '\u{1F4C5}' },
    { id: 'shop',      name: 'Shop',      icon: '\u{1F6D2}' },
    { id: 'transfers', name: 'Transfers', icon: '\u{1F4DD}' },
    { id: 'profile',   name: 'Profile',   icon: '\u{1F464}' },
    // The globe is deliberately unlike the seven above it: at <=620px
    // CareerShell hides .ctab-t entirely, so the emoji IS the tab.
    { id: 'board',     name: 'Legends',   icon: '\u{1F30D}' },
];
