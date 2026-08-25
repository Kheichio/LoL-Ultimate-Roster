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
        key: 'mec', name: 'Mechanics', abbr: 'MEC', color: '#ef4444', game: 'lasthit',
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
        trainingMult: 1.10,
    },
    {
        id: 'LPL', name: 'China', league: 'LPL', flag: '\u{1F1E8}\u{1F1F3}', accent: '#ef4444',
        blurb: 'Chaos as a system. Every lane fights on cooldown and the highest mechanical ceiling in the world lives here.',
        mods: { mec: 5, tmf: 4, chp: 1, cmp: -4, map: -1, lne: 0, knw: -1, ldr: 0 },
        difficulty: 1.15, salaryMult: 1.20, hypeMult: 1.0, scoutMult: 1.05,
        trainingMult: 1.05,
    },
    {
        id: 'LEC', name: 'Europe', league: 'LEC', flag: '\u{1F1EA}\u{1F1FA}', accent: '#22d3ee',
        blurb: 'Draft-first, personality-first. Weird picks win here, and the region exports more shotcallers than any other.',
        mods: { chp: 4, ldr: 3, knw: 2, mec: -2, lne: -1, cmp: 0, map: 1, tmf: -2 },
        difficulty: 1.00, salaryMult: 1.00, hypeMult: 1.15, scoutMult: 1.00,
        trainingMult: 1.00,
    },
    {
        id: 'LCS', name: 'North America', league: 'LCS', flag: '\u{1F1FA}\u{1F1F8}', accent: '#f59e0b',
        blurb: 'The money is real and so is the content. The league is softer, so international results count double for your reputation.',
        mods: { tmf: 2, cmp: 2, knw: 1, chp: 1, lne: -3, map: -1, mec: -1, ldr: 0 },
        difficulty: 0.88, salaryMult: 1.30, hypeMult: 1.25, scoutMult: 0.90,
        trainingMult: 0.92,
    },
    {
        id: 'LCP', name: 'Asia-Pacific', league: 'LCP', flag: '\u{1F30F}', accent: '#14b8a6',
        blurb: 'The underdog circuit. Smaller salaries, faster promotions, and a real path to a starting seat before you turn seventeen.',
        mods: { map: 3, ldr: 2, tmf: 1, chp: 1, mec: -2, knw: -1, lne: 0, cmp: 0 },
        difficulty: 0.82, salaryMult: 0.75, hypeMult: 0.85, scoutMult: 1.20,
        trainingMult: 0.96,
    },
];

export const REGION_IDS = REGIONS.map(r => r.id);
export const REGION_BY_ID = REGIONS.reduce((m, r) => { m[r.id] = r; return m; }, {});

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
export const FIT_MAX = 0.24;
export const STYLE_POOL_MIN = 8;

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
    { id: 'preseason', name: 'Preseason',        short: 'PRE', from: 1,  to: 4,  accent: '#64748b', desc: 'Rosters lock, bootcamps run, nothing counts yet.' },
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
        needsClub: false,
    },
    {
        id: 'soloq', name: 'Solo Queue', icon: '\u{1F3AE}', accent: '#22c55e', energy: 18,
        desc: 'Grind the ladder. Small all-round gains, ranked progress and a trickle of followers.',
        needsClub: false,
    },
    {
        id: 'scrim', name: 'Scrim Block', icon: '\u{2694}', accent: '#f59e0b', energy: 22,
        desc: 'Practise with the roster. Builds teamfighting, shotcalling and team chemistry.',
        needsClub: true,
    },
    {
        id: 'vod', name: 'VOD Review', icon: '\u{1F4FC}', accent: '#a855f7', energy: 10,
        desc: 'Study replays. Cheap, reliable game knowledge and map awareness.',
        needsClub: false,
    },
    {
        id: 'stream', name: 'Stream', icon: '\u{1F3A5}', accent: '#ec4899', energy: 15,
        desc: 'Go live. Gold and followers now, at the cost of practice time.',
        needsClub: false,
    },
    {
        id: 'media', name: 'Media & Content', icon: '\u{1F4F0}', accent: '#22d3ee', energy: 8,
        desc: 'Interviews, photoshoots, a podcast nobody asked for. Hype up, morale volatile.',
        needsClub: false,
    },
    {
        id: 'gym', name: 'Gym & Physio', icon: '\u{1F9BE}', accent: '#14b8a6', energy: 12,
        desc: 'Wrists, back, sleep. Repairs health and lowers injury risk for weeks to come.',
        needsClub: false,
    },
    {
        id: 'rest', name: 'Rest Day', icon: '\u{1F634}', accent: '#64748b', energy: -50,
        desc: 'Do nothing on purpose. Restores energy and morale, and nothing else.',
        needsClub: false,
    },
];

export const ACTIVITY_BY_ID = ACTIVITIES.reduce((m, a) => { m[a.id] = a; return m; }, {});

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
//  CLUB TIERS
//  Tier 3 is where a pre-comp prospect starts (amateur / open circuit),
//  tier 2 is academy & challengers, tier 1 is the main league.
// ─────────────────────────────────────────────────────────────────────────
export const CLUB_TIERS = {
    1: { id: 1, name: 'Main League',   short: 'T1', accent: '#eab308', salaryMult: 1.00, trainingMult: 1.25, prestige: 3 },
    2: { id: 2, name: 'Academy',       short: 'T2', accent: '#3b82f6', salaryMult: 0.22, trainingMult: 1.10, prestige: 2 },
    3: { id: 3, name: 'Amateur',       short: 'T3', accent: '#64748b', salaryMult: 0.05, trainingMult: 0.95, prestige: 1 },
};

// Weekly club training sessions by tier — the debut path's main constraint.
export const CLUB_TRAINING_SLOTS = { 1: 3, 2: 2, 3: 1 };

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
export const SQUAD_STATUS = {
    star:     { id: 'star',     name: 'Franchise Player', accent: '#eab308', playChance: 1.00, moraleDrift:  1 },
    starter:  { id: 'starter',  name: 'Starter',          accent: '#22c55e', playChance: 0.95, moraleDrift:  0 },
    rotation: { id: 'rotation', name: 'Rotation',         accent: '#3b82f6', playChance: 0.55, moraleDrift: -1 },
    sub:      { id: 'sub',      name: 'Substitute',       accent: '#f59e0b', playChance: 0.20, moraleDrift: -2 },
    benched:  { id: 'benched',  name: 'Benched',          accent: '#ef4444', playChance: 0.05, moraleDrift: -4 },
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
];
