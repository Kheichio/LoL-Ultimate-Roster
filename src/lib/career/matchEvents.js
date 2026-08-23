// ===========================================================================
//  LoL ULTIMATE CAREER - match decision pools
// ===========================================================================
//  Every prompt, option and piece of written flavour the match engine draws
//  from. ./match.js owns the maths; this file owns the words.
//
//  An event is one moment of one game. It knows which phase it belongs to
//  (early / mid / late), how often it should come up (weight), and the three
//  or four things a player could do about it.
//
//  An option is a bet. It is resolved in match.js against:
//    attrs      - the attributes that carry the play, averaged
//    difficulty - 0..1. 0.2 wants ~39 in those attrs for a coin flip, 0.5
//                 wants ~59, 0.85 wants ~82. Greed lives above 0.65.
//    reward     - 2-15, paid into advantage and personal on a success
//    risk       - 2-15, taken out of both on a failure
//    bias       - {aggression, risk, teamplay}, matched against playstyle and
//                 signature champion. This is what makes a Split Pusher and an
//                 Engage support answer the same prompt differently.
//    when       - 'ahead' | 'behind' | 'even' | 'fed' | 'struggling'. The map
//                 read. Correct is worth +9% and wrong costs 7%, and nothing
//                 in the option text tells you which is which. Options with no
//                 marker are the ones that are never wrong, only unexciting.
//
//  Option-count discipline: three or four per event, never two, never five.
//
//  Every event carries a safest option and a greedy one, at least 0.12 of
//  difficulty apart. The safest option gets harder as the game goes on - it
//  averages 0.29 in the early game, 0.36 in the mid and 0.44 in the late, and
//  never exceeds 0.58 anywhere. That is deliberate: there is no safe answer to
//  an Elder fight, but a 55 OVR rookie can still hit the calmest option in the
//  hardest event about two times in five.
//
//  ASCII only. Emoji are \u escapes; this repo has been corrupted before.
//
//  This file is DATA ONLY. It imports nothing and it must stay that way.

// ---------------------------------------------------------------------------
//  BUILDERS
// ---------------------------------------------------------------------------

/** A {aggression, risk, teamplay} triple, written positionally to keep the
 *  data below readable. All three run 0..1. */
function bias(aggression, risk, teamplay) {
    return { aggression, risk, teamplay };
}

function clamp01(v, d) {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return n < 0 ? 0 : n > 1 ? 1 : n;
}

function span(v, d) {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return n < 2 ? 2 : n > 15 ? 15 : n;
}

/**
 * One choice inside an event. Everything except id and label has a default, so
 * a plain `opt('back', 'Back off')` is a legal safe option.
 */
function opt(id, label, spec = {}) {
    const attrs = Array.isArray(spec.attrs) && spec.attrs.length ? spec.attrs.slice() : ['knw'];
    return {
        id,
        label,
        // Optional second line under the label. The events below carry
        // self-describing labels ("Freeze it on your side and starve him out")
        // and deliberately leave this unset, but MatchDay renders it behind an
        // {#if}, so any option that wants the extra line only has to add one.
        desc: typeof spec.desc === 'string' ? spec.desc : '',
        attrs,
        difficulty: clamp01(spec.difficulty, 0.5),
        reward: span(spec.reward, 7),
        risk: span(spec.risk, 6),
        bias: spec.bias || bias(0.5, 0.5, 0.5),
        when: spec.when || null,
    };
}

/**
 * One decision. `weight` is relative inside its own phase bucket - the set
 * pieces sit near 1.2 and the situational oddities near 0.7, so a season does
 * not feel like the same five prompts on a loop.
 */
function ev(id, phase, prompt, options, weight = 1) {
    return { id, phase, prompt, options, weight };
}

// ---------------------------------------------------------------------------
//  TOP
//  An island. Most of these are about whether the island is worth leaving.
// ---------------------------------------------------------------------------
export const TOP_EVENTS = [
    // --- early -------------------------------------------------------------
    ev('top_e_freeze', 'early',
        'You lose the level one but the wave is rolling back to you. Their jungler has not shown since the first buff.',
        [
            opt('freeze', 'Freeze it on your side and starve him out', {
                attrs: ['lne'], difficulty: 0.34, reward: 6, risk: 3,
                bias: bias(0.30, 0.25, 0.40), when: 'even',
            }),
            opt('allin', 'Ignore the wave and go for the all-in now', {
                attrs: ['mec', 'lne'], difficulty: 0.72, reward: 12, risk: 11,
                bias: bias(0.90, 0.80, 0.20),
            }),
            opt('ward', 'Ward the tribush before you commit to anything', {
                attrs: ['map'], difficulty: 0.28, reward: 5, risk: 3,
                bias: bias(0.25, 0.20, 0.60),
            }),
        ], 1.2),

    ev('top_e_trade', 'early',
        'He walks up with his stun down and yours is up. The wave is dead even in the middle of the lane.',
        [
            opt('trade', 'Take the full trade', {
                attrs: ['mec'], difficulty: 0.55, reward: 9, risk: 7,
                bias: bias(0.80, 0.60, 0.25), when: 'even',
            }),
            opt('chip', 'Chip him with autos and reset the wave', {
                attrs: ['lne'], difficulty: 0.36, reward: 6, risk: 4,
                bias: bias(0.50, 0.35, 0.40),
            }),
            opt('setup', 'Ignore it and set up the crash instead', {
                attrs: ['lne', 'knw'], difficulty: 0.30, reward: 5, risk: 3,
                bias: bias(0.30, 0.25, 0.50), when: 'behind',
            }),
        ], 1.1),

    ev('top_e_tp', 'early',
        'Teleport is up on both sides and bot lane is walking into the first dragon.',
        [
            opt('tpnow', 'Teleport down and make it a 3v3', {
                attrs: ['map', 'tmf'], difficulty: 0.58, reward: 10, risk: 8,
                bias: bias(0.70, 0.65, 0.90), when: 'even',
            }),
            opt('plates', 'Hold Teleport and take two plates instead', {
                attrs: ['lne'], difficulty: 0.38, reward: 7, risk: 5,
                bias: bias(0.55, 0.40, 0.20), when: 'ahead',
            }),
            opt('mid', 'Shove and walk mid for the crossmap', {
                attrs: ['map'], difficulty: 0.48, reward: 8, risk: 6,
                bias: bias(0.55, 0.50, 0.75),
            }),
            opt('nothing', 'Stay home and take the free wave', {
                attrs: ['lne'], difficulty: 0.22, reward: 4, risk: 3,
                bias: bias(0.20, 0.15, 0.30),
            }),
        ], 1.2),

    ev('top_e_greed', 'early',
        'You are on forty percent health with the wave crashing and their jungler has not been seen for ninety seconds.',
        [
            opt('greed', 'Stay for the crash', {
                attrs: ['lne'], difficulty: 0.66, reward: 9, risk: 10,
                bias: bias(0.65, 0.85, 0.20),
            }),
            opt('reset', 'Give the wave up and reset on your terms', {
                attrs: ['cmp'], difficulty: 0.24, reward: 4, risk: 3,
                bias: bias(0.20, 0.15, 0.45), when: 'struggling',
            }),
            opt('scan', 'Ward the tri and decide from there', {
                attrs: ['map'], difficulty: 0.40, reward: 7, risk: 5,
                bias: bias(0.40, 0.35, 0.55),
            }),
        ]),

    ev('top_e_scuttle', 'early',
        'The scuttle below you is turning into a 2v2 your jungler is losing.',
        [
            opt('tp', 'Teleport into the river fight', {
                attrs: ['tmf', 'map'], difficulty: 0.64, reward: 11, risk: 10,
                bias: bias(0.80, 0.75, 0.95),
            }),
            opt('walk', 'Walk down without Teleport and hope it holds', {
                attrs: ['mec'], difficulty: 0.56, reward: 8, risk: 8,
                bias: bias(0.70, 0.70, 0.70),
            }),
            opt('plate', 'Let it go and take the plate', {
                attrs: ['lne'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.45, 0.30, 0.15), when: 'ahead',
            }),
        ], 0.9),

    // --- mid ---------------------------------------------------------------
    ev('top_m_split', 'mid',
        'Your team is setting the second dragon and your side wave is about to sit under their tower.',
        [
            opt('keep', 'Keep splitting and make them send two', {
                attrs: ['lne', 'cmp'], difficulty: 0.55, reward: 10, risk: 9,
                bias: bias(0.65, 0.70, 0.15), when: 'ahead',
            }),
            opt('rotate', 'Give the wave and rotate to the pit', {
                attrs: ['tmf'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.40, 0.30, 0.90), when: 'behind',
            }),
            opt('flex', 'Split until the fight starts, then Teleport in', {
                attrs: ['map', 'tmf'], difficulty: 0.70, reward: 13, risk: 11,
                bias: bias(0.70, 0.75, 0.70),
            }),
        ], 1.3),

    ev('top_m_1v2', 'mid',
        'They send two at you in the side lane while your four sit on Baron vision.',
        [
            opt('hold', 'Hold them there as long as you can', {
                attrs: ['cmp', 'lne'], difficulty: 0.62, reward: 11, risk: 8,
                bias: bias(0.45, 0.65, 0.85), when: 'even',
            }),
            opt('fight', 'Take the 1v2', {
                attrs: ['mec'], difficulty: 0.86, reward: 14, risk: 13,
                bias: bias(0.95, 0.95, 0.10),
            }),
            opt('leave', 'Walk away and join the Baron call', {
                attrs: ['map'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.25, 0.20, 0.85),
            }),
        ], 1.1),

    ev('top_m_herald', 'mid',
        'Herald is up, your jungler wants it, and their mid laner is missing.',
        [
            opt('fast', 'Take it fast and get out', {
                attrs: ['tmf'], difficulty: 0.45, reward: 8, risk: 6,
                bias: bias(0.55, 0.50, 0.80),
            }),
            opt('vision', 'Ward their side first, then take it', {
                attrs: ['knw', 'map'], difficulty: 0.40, reward: 7, risk: 5,
                bias: bias(0.35, 0.30, 0.75), when: 'ahead',
            }),
            opt('contest', 'Set up on their side of the pit and invite the fight', {
                attrs: ['mec', 'tmf'], difficulty: 0.74, reward: 12, risk: 12,
                bias: bias(0.90, 0.85, 0.65),
            }),
        ]),

    ev('top_m_dive', 'mid',
        'You are three levels up on their top laner and he will not step off the tower.',
        [
            opt('dive', 'Dive him under it', {
                attrs: ['mec'], difficulty: 0.72, reward: 12, risk: 11,
                bias: bias(0.90, 0.85, 0.30), when: 'fed',
            }),
            opt('plate', 'Take the plate and reset the wave', {
                attrs: ['lne'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.40, 0.25, 0.30),
            }),
            opt('roam', 'Shove it in and roam mid', {
                attrs: ['map', 'ldr'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.65, 0.55, 0.85),
            }),
        ], 0.9),

    ev('top_m_flank', 'mid',
        'A skirmish opens in the river and you are the only one with a flank angle.',
        [
            opt('flank', 'Take the long way around and flank', {
                attrs: ['tmf', 'map'], difficulty: 0.68, reward: 12, risk: 10,
                bias: bias(0.85, 0.80, 0.70),
            }),
            opt('front', 'Walk in from the front with your team', {
                attrs: ['tmf'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.60, 0.45, 0.95), when: 'even',
            }),
            opt('wave', 'Stay on the wave and let them handle it', {
                attrs: ['lne'], difficulty: 0.25, reward: 5, risk: 4,
                bias: bias(0.25, 0.20, 0.15), when: 'behind',
            }),
        ], 1.1),

    // --- late --------------------------------------------------------------
    ev('top_l_baron', 'late',
        'Baron is up, they are somewhere on the map, and the call is for you to start the fight.',
        [
            opt('engage', 'Engage onto the closest one', {
                attrs: ['tmf', 'cmp'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.90, 0.80, 0.85),
            }),
            opt('start', 'Start Baron and let them walk into it', {
                attrs: ['ldr', 'knw'], difficulty: 0.52, reward: 9, risk: 8,
                bias: bias(0.55, 0.65, 0.90), when: 'ahead',
            }),
            opt('stall', 'Clear their vision and stall for the next wave', {
                attrs: ['map'], difficulty: 0.34, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.70), when: 'behind',
            }),
        ], 1.3),

    ev('top_l_inhib', 'late',
        'The inhibitor is one hit away and your base is being hit four on five.',
        [
            opt('take', 'Take the inhibitor', {
                attrs: ['cmp', 'lne'], difficulty: 0.58, reward: 12, risk: 10,
                bias: bias(0.70, 0.75, 0.30), when: 'even',
            }),
            opt('home', 'Teleport home and defend', {
                attrs: ['map', 'tmf'], difficulty: 0.40, reward: 7, risk: 6,
                bias: bias(0.35, 0.30, 0.95), when: 'behind',
            }),
            opt('nexus', 'Ignore all of it and go for the nexus turrets', {
                attrs: ['lne', 'cmp'], difficulty: 0.80, reward: 14, risk: 13,
                bias: bias(0.85, 0.95, 0.10), when: 'ahead',
            }),
        ], 1.1),

    ev('top_l_elder', 'late',
        'Elder is thirty seconds out and both teams are standing on their own side of the pit.',
        [
            opt('first', 'Engage first and pick the terms', {
                attrs: ['tmf'], difficulty: 0.70, reward: 13, risk: 12,
                bias: bias(0.95, 0.85, 0.80),
            }),
            opt('hold', 'Hold and let them come to you', {
                attrs: ['cmp'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.30, 0.40, 0.85), when: 'ahead',
            }),
            opt('side', 'Take the side wave and force a four on four', {
                attrs: ['map', 'lne'], difficulty: 0.55, reward: 10, risk: 9,
                bias: bias(0.60, 0.70, 0.35),
            }),
        ], 1.2),

    ev('top_l_hold', 'late',
        'They aced everyone but you and both nexus turrets are already down.',
        [
            opt('alone', 'Hold the base alone', {
                attrs: ['cmp', 'tmf'], difficulty: 0.82, reward: 14, risk: 12,
                bias: bias(0.55, 0.85, 0.90), when: 'struggling',
            }),
            opt('fog', 'Buy time in the fog and wait for respawns', {
                attrs: ['map', 'cmp'], difficulty: 0.55, reward: 9, risk: 7,
                bias: bias(0.30, 0.55, 0.80),
            }),
            opt('carry', 'Run at their carry and take somebody with you', {
                attrs: ['mec'], difficulty: 0.88, reward: 15, risk: 14,
                bias: bias(1.00, 0.95, 0.35),
            }),
        ], 0.8),

    ev('top_l_pick', 'late',
        'Their carry keeps stepping too far forward in a stalled mid lane, and you are one flash away.',
        [
            opt('flash', 'Flash in on him', {
                attrs: ['mec', 'tmf'], difficulty: 0.75, reward: 13, risk: 12,
                bias: bias(0.95, 0.90, 0.55), when: 'fed',
            }),
            opt('wait', 'Wait for your support to start it', {
                attrs: ['tmf'], difficulty: 0.45, reward: 8, risk: 6,
                bias: bias(0.45, 0.40, 0.95),
            }),
            opt('match', 'Reset and match their side wave', {
                attrs: ['lne'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.30, 0.25, 0.25),
            }),
        ]),
];

// ---------------------------------------------------------------------------
//  JNG
//  Pathing, tempo and being blamed for all five lanes.
// ---------------------------------------------------------------------------
export const JNG_EVENTS = [
    // --- early -------------------------------------------------------------
    ev('jng_e_invade', 'early',
        'They started red and you can be standing on their blue before they are.',
        [
            opt('invade', 'Take the blue and walk out the far side', {
                attrs: ['map', 'mec'], difficulty: 0.65, reward: 11, risk: 10,
                bias: bias(0.85, 0.85, 0.35),
            }),
            opt('clear', 'Full clear your own side', {
                attrs: ['knw'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.25, 0.20, 0.45),
            }),
            opt('scuttle', 'Skip it and be first to the topside scuttle', {
                attrs: ['map'], difficulty: 0.45, reward: 8, risk: 6,
                bias: bias(0.55, 0.50, 0.65), when: 'even',
            }),
        ], 1.2),

    ev('jng_e_gank_bot', 'early',
        'Bot lane is pushing with both summoners up and their support has no flash.',
        [
            opt('gank', 'Gank it now', {
                attrs: ['mec', 'tmf'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.80, 0.65, 0.85), when: 'even',
            }),
            opt('setup', 'Take scuttle first and set up the dive', {
                attrs: ['map', 'ldr'], difficulty: 0.55, reward: 10, risk: 8,
                bias: bias(0.65, 0.60, 0.90),
            }),
            opt('farm', 'Keep farming and track their jungler instead', {
                attrs: ['knw'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.40),
            }),
        ], 1.3),

    ev('jng_e_counter', 'early',
        'Their jungler shows bot side and your top laner is shoving into a level six matchup.',
        [
            opt('collapse', 'Path top and collapse before he gets there', {
                attrs: ['map'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.70, 0.60, 0.85),
            }),
            opt('counter', 'Follow him bot and counter-gank', {
                attrs: ['tmf', 'mec'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.85, 0.75, 0.90),
            }),
            opt('camps', 'Take his topside camps while he is busy', {
                attrs: ['knw', 'map'], difficulty: 0.40, reward: 8, risk: 5,
                bias: bias(0.45, 0.55, 0.20), when: 'ahead',
            }),
            opt('ping', 'Ping the danger and keep your own tempo', {
                attrs: ['knw'], difficulty: 0.24, reward: 5, risk: 3,
                bias: bias(0.20, 0.20, 0.50),
            }),
        ], 1.1),

    ev('jng_e_drake', 'early',
        'First dragon spawns in forty seconds and you are on the wrong side of the map.',
        [
            opt('cross', 'Path across and contest it anyway', {
                attrs: ['map', 'cmp'], difficulty: 0.60, reward: 10, risk: 9,
                bias: bias(0.75, 0.75, 0.80),
            }),
            opt('trade', 'Give it and take Herald instead', {
                attrs: ['knw', 'ldr'], difficulty: 0.35, reward: 7, risk: 5,
                bias: bias(0.45, 0.35, 0.70), when: 'behind',
            }),
            opt('vision', 'Ward the pit and take the free camps on this side', {
                attrs: ['map'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.30, 0.25, 0.55),
            }),
        ], 1.2),

    ev('jng_e_lvl3', 'early',
        'You are level three, their mid is shoved in, and their jungler is bot side.',
        [
            opt('mid', 'Gank mid', {
                attrs: ['mec'], difficulty: 0.45, reward: 8, risk: 6,
                bias: bias(0.75, 0.60, 0.80),
            }),
            opt('invade', 'Walk into the side he left open', {
                attrs: ['map'], difficulty: 0.55, reward: 10, risk: 8,
                bias: bias(0.70, 0.80, 0.30), when: 'ahead',
            }),
            opt('six', 'Full clear to six and start playing then', {
                attrs: ['knw'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.20, 0.20, 0.40), when: 'struggling',
            }),
        ]),

    // --- mid ---------------------------------------------------------------
    ev('jng_m_soul', 'mid',
        'This is the dragon that puts a soul point on the board and their jungler has smite up.',
        [
            opt('smite', 'Start it and win the smite', {
                attrs: ['mec', 'cmp'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.75, 0.85, 0.75),
            }),
            opt('fight', 'Force the fight before the pit is ever started', {
                attrs: ['tmf', 'ldr'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.90, 0.75, 0.90), when: 'even',
            }),
            opt('trade', 'Give the dragon and take everything topside', {
                attrs: ['knw', 'map'], difficulty: 0.38, reward: 7, risk: 5,
                bias: bias(0.35, 0.40, 0.55), when: 'behind',
            }),
        ], 1.3),

    ev('jng_m_bait', 'mid',
        'Their team is grouped mid and Baron is completely unwarded.',
        [
            opt('start', 'Start Baron and make them find it', {
                attrs: ['ldr', 'knw'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.70, 0.90, 0.85), when: 'even',
            }),
            opt('ward', 'Ward it and take the free side camps', {
                attrs: ['map'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.55),
            }),
            opt('pick', 'Look for a pick on whoever walks out first', {
                attrs: ['map', 'tmf'], difficulty: 0.58, reward: 10, risk: 9,
                bias: bias(0.80, 0.70, 0.70),
            }),
        ], 1.1),

    ev('jng_m_deep', 'mid',
        'You have a control ward, a sweeper and about eight seconds of them not looking at their own jungle.',
        [
            opt('deep', 'Walk it all the way in behind their red', {
                attrs: ['map', 'cmp'], difficulty: 0.64, reward: 11, risk: 10,
                bias: bias(0.60, 0.85, 0.75),
            }),
            opt('pit', 'Put it in the pit and leave', {
                attrs: ['map'], difficulty: 0.34, reward: 7, risk: 4,
                bias: bias(0.30, 0.30, 0.80),
            }),
            opt('river', 'Sweep the river instead and take the vision fight', {
                attrs: ['knw', 'map'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.50, 0.50, 0.75), when: 'ahead',
            }),
        ]),

    ev('jng_m_counter', 'mid',
        'All five of them are grouped for a tower and their jungle is empty.',
        [
            opt('strip', 'Strip the whole quadrant', {
                attrs: ['knw', 'map'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.55, 0.70, 0.20), when: 'behind',
            }),
            opt('defend', 'Go defend the tower with them', {
                attrs: ['tmf'], difficulty: 0.44, reward: 8, risk: 7,
                bias: bias(0.50, 0.40, 0.95),
            }),
            opt('crossmap', 'Take the dragon on the other side of the map', {
                attrs: ['ldr', 'knw'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.60, 0.75, 0.60), when: 'even',
            }),
        ], 1.1),

    ev('jng_m_pick', 'mid',
        'Their carry is walking to the side lane alone and you are already in that bush.',
        [
            opt('go', 'Take it yourself', {
                attrs: ['mec', 'tmf'], difficulty: 0.68, reward: 12, risk: 11,
                bias: bias(0.95, 0.85, 0.40), when: 'fed',
            }),
            opt('call', 'Hold and call your mid down for it', {
                attrs: ['ldr'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.65, 0.55, 0.95),
            }),
            opt('let', 'Let him walk and keep the camps rolling', {
                attrs: ['knw'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.20, 0.20, 0.35),
            }),
        ], 1.2),

    // --- late --------------------------------------------------------------
    ev('jng_l_smite', 'late',
        'Elder is at four thousand health, both smites are up, and everyone is in the pit.',
        [
            opt('smite', 'Take the smite fight', {
                attrs: ['mec', 'cmp'], difficulty: 0.78, reward: 14, risk: 13,
                bias: bias(0.80, 0.90, 0.85),
            }),
            opt('bait', 'Bait their smite and let your team clean up', {
                attrs: ['knw', 'ldr'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.70, 0.85, 0.95), when: 'even',
            }),
            opt('leave', 'Give the pit and take the Baron behind it', {
                attrs: ['ldr', 'map'], difficulty: 0.55, reward: 11, risk: 9,
                bias: bias(0.55, 0.75, 0.70), when: 'behind',
            }),
        ], 1.3),

    ev('jng_l_baron', 'late',
        'Two of them are dead, Baron is up, and your bot lane is still walking from base.',
        [
            opt('now', 'Start it now with three', {
                attrs: ['ldr', 'cmp'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.85, 0.90, 0.80),
            }),
            opt('wait', 'Wait the fifteen seconds for five', {
                attrs: ['ldr', 'knw'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.45, 0.40, 0.95), when: 'ahead',
            }),
            opt('towers', 'Skip it and take towers while they respawn', {
                attrs: ['knw'], difficulty: 0.36, reward: 8, risk: 5,
                bias: bias(0.50, 0.35, 0.70),
            }),
        ], 1.2),

    ev('jng_l_defend', 'late',
        'They are hitting your inhibitor and your top laner is one wave from theirs.',
        [
            opt('trade', 'Call the trade and let it go', {
                attrs: ['ldr', 'knw'], difficulty: 0.60, reward: 11, risk: 10,
                bias: bias(0.65, 0.80, 0.60), when: 'even',
            }),
            opt('defend', 'Collapse and defend it', {
                attrs: ['tmf', 'cmp'], difficulty: 0.55, reward: 10, risk: 9,
                bias: bias(0.55, 0.45, 0.95), when: 'behind',
            }),
            opt('flank', 'Flank the ones sieging and start it there', {
                attrs: ['tmf', 'map'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.90, 0.85, 0.75),
            }),
        ], 1.1),

    ev('jng_l_vision', 'late',
        'Nobody has walked into the enemy half of the map in three minutes and the next objective decides the game.',
        [
            opt('clear', 'Clear it out yourself and set the pit up', {
                attrs: ['map', 'cmp'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.60, 0.75, 0.85),
            }),
            opt('group', 'Group with everyone and ward it as five', {
                attrs: ['ldr'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.40, 0.35, 1.00),
            }),
            opt('pressure', 'Send them to side lanes and make them move first', {
                attrs: ['ldr', 'knw'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.60, 0.65, 0.75), when: 'ahead',
            }),
        ]),

    ev('jng_l_scaling', 'late',
        'Their comp gets better every minute and the game has been even for eleven of them.',
        [
            opt('force', 'Force something at the next Baron spawn', {
                attrs: ['ldr', 'tmf'], difficulty: 0.70, reward: 13, risk: 12,
                bias: bias(0.90, 0.90, 0.85), when: 'even',
            }),
            opt('pick', 'Hunt one pick and take the game off the back of it', {
                attrs: ['map', 'mec'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.85, 0.80, 0.60),
            }),
            opt('scale', 'Match their scaling and take the safe farm', {
                attrs: ['knw'], difficulty: 0.34, reward: 6, risk: 5,
                bias: bias(0.20, 0.20, 0.50),
            }),
        ], 0.9),
];

// ---------------------------------------------------------------------------
//  MID
//  Priority, roams, and the fallback pool when a role id is not recognised.
// ---------------------------------------------------------------------------
export const MID_EVENTS = [
    // --- early -------------------------------------------------------------
    ev('mid_e_prio', 'early',
        'You can shove this wave in and be first to the river, or you can hold and farm it safely.',
        [
            opt('shove', 'Shove and take the river', {
                attrs: ['lne', 'map'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.70, 0.60, 0.85), when: 'even',
            }),
            opt('hold', 'Hold and farm it under tower', {
                attrs: ['lne'], difficulty: 0.26, reward: 5, risk: 3,
                bias: bias(0.25, 0.20, 0.35),
            }),
            opt('freeze', 'Slow push it for a bigger crash in two waves', {
                attrs: ['lne', 'knw'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.45, 0.45, 0.40),
            }),
        ], 1.3),

    ev('mid_e_roam', 'early',
        'Their mid recalled, your wave is crashing, and bot lane is two levels up on theirs.',
        [
            opt('roam', 'Roam bot', {
                attrs: ['map'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.80, 0.65, 0.90), when: 'even',
            }),
            opt('tower', 'Stay and hit the tower', {
                attrs: ['lne'], difficulty: 0.30, reward: 7, risk: 4,
                bias: bias(0.45, 0.30, 0.25), when: 'ahead',
            }),
            opt('jungle', 'Take their raptors on the way past', {
                attrs: ['knw', 'map'], difficulty: 0.40, reward: 7, risk: 6,
                bias: bias(0.55, 0.55, 0.35),
            }),
        ], 1.2),

    ev('mid_e_matchup', 'early',
        'You are into a matchup you lose until eleven minutes and he knows it.',
        [
            opt('survive', 'Play for farm and give nothing', {
                attrs: ['cmp', 'lne'], difficulty: 0.34, reward: 6, risk: 4,
                bias: bias(0.20, 0.20, 0.40), when: 'struggling',
            }),
            opt('punish', 'Look for the one cooldown he has to use', {
                attrs: ['knw', 'mec'], difficulty: 0.68, reward: 11, risk: 10,
                bias: bias(0.80, 0.75, 0.30),
            }),
            opt('call', 'Call your jungler over and turn it into a 2v2', {
                attrs: ['ldr'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.60, 0.55, 0.95),
            }),
        ], 1.1),

    ev('mid_e_skirmish', 'early',
        'A 2v2 breaks out on the topside scuttle and you have prio with flash up.',
        [
            opt('flash', 'Flash the wall and join it', {
                attrs: ['mec', 'tmf'], difficulty: 0.64, reward: 11, risk: 10,
                bias: bias(0.90, 0.85, 0.85),
            }),
            opt('walk', 'Walk around and arrive late but safe', {
                attrs: ['map'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.50, 0.40, 0.80),
            }),
            opt('wave', 'Take the free wave while everyone else fights', {
                attrs: ['lne'], difficulty: 0.24, reward: 5, risk: 3,
                bias: bias(0.20, 0.20, 0.20), when: 'behind',
            }),
        ]),

    ev('mid_e_gank', 'early',
        'Their jungler is coming and your wave is on the wrong side of the lane.',
        [
            opt('flash', 'Burn flash to keep the wave', {
                attrs: ['mec', 'cmp'], difficulty: 0.60, reward: 9, risk: 9,
                bias: bias(0.60, 0.80, 0.30),
            }),
            opt('give', 'Give the wave and walk away clean', {
                attrs: ['map'], difficulty: 0.28, reward: 5, risk: 3,
                bias: bias(0.20, 0.20, 0.45),
            }),
            opt('turn', 'Turn on the two of them', {
                attrs: ['mec'], difficulty: 0.84, reward: 14, risk: 13,
                bias: bias(1.00, 0.95, 0.25),
            }),
        ], 1.2),

    // --- mid ---------------------------------------------------------------
    ev('mid_m_rotate', 'mid',
        'The dragon is up in ninety seconds and you have a wave you can crash first.',
        [
            opt('crash', 'Crash it and arrive on time', {
                attrs: ['lne', 'map'], difficulty: 0.44, reward: 9, risk: 6,
                bias: bias(0.55, 0.45, 0.85),
            }),
            opt('early', 'Leave now and get vision up before anyone else', {
                attrs: ['map'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.45, 0.45, 0.90), when: 'even',
            }),
            opt('greed', 'Take the tower first and rotate late', {
                attrs: ['lne', 'cmp'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.70, 0.85, 0.20), when: 'ahead',
            }),
        ], 1.3),

    ev('mid_m_sidelane', 'mid',
        'Your team wants you to take the side lane so the jungler can hold mid.',
        [
            opt('side', 'Take the side and play it patiently', {
                attrs: ['lne', 'cmp'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.50, 0.50, 0.75),
            }),
            opt('refuse', 'Stay mid where your champion actually works', {
                attrs: ['knw'], difficulty: 0.38, reward: 7, risk: 6,
                bias: bias(0.45, 0.40, 0.20),
            }),
            opt('aggro', 'Take the side and immediately look to fight over it', {
                attrs: ['mec', 'tmf'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.90, 0.85, 0.55), when: 'fed',
            }),
        ], 1.1),

    ev('mid_m_pick', 'mid',
        'Their support is walking to place a ward with no vision anywhere near him.',
        [
            opt('go', 'Take the pick', {
                attrs: ['mec', 'map'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.85, 0.75, 0.60), when: 'even',
            }),
            opt('collapse', 'Ping it and let three people collapse instead', {
                attrs: ['ldr'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.60, 0.50, 0.95),
            }),
            opt('ignore', 'Leave it and keep the wave state you have', {
                attrs: ['lne'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.20, 0.20, 0.30),
            }),
        ], 1.2),

    ev('mid_m_teamfight', 'mid',
        'The fight starts at the pit and their frontline is between you and everything worth killing.',
        [
            opt('back', 'Play it from max range and take the back line later', {
                attrs: ['tmf', 'cmp'], difficulty: 0.52, reward: 10, risk: 7,
                bias: bias(0.35, 0.35, 0.85),
            }),
            opt('dive', 'Dive past them onto their carry', {
                attrs: ['mec', 'tmf'], difficulty: 0.78, reward: 14, risk: 13,
                bias: bias(0.95, 0.95, 0.45),
            }),
            opt('peel', 'Turn around and peel for your own carry', {
                attrs: ['tmf'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.35, 0.35, 1.00), when: 'behind',
            }),
        ], 1.2),

    ev('mid_m_tempo', 'mid',
        'You just used your ultimate on a wave and they are grouping on the other side of the map.',
        [
            opt('follow', 'Follow anyway without it', {
                attrs: ['tmf', 'cmp'], difficulty: 0.62, reward: 10, risk: 10,
                bias: bias(0.75, 0.70, 0.90),
            }),
            opt('reset', 'Reset and come back with items and cooldowns', {
                attrs: ['knw'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.50),
            }),
            opt('cross', 'Take the crossmap objective while they commit', {
                attrs: ['map', 'ldr'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.60, 0.75, 0.60), when: 'ahead',
            }),
        ]),

    // --- late --------------------------------------------------------------
    ev('mid_l_flank', 'late',
        'Both teams are stood in mid and there is a flank angle nobody is warding.',
        [
            opt('flank', 'Take the flank', {
                attrs: ['map', 'tmf'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.90, 0.90, 0.65),
            }),
            opt('stand', 'Stay in the line and poke it down', {
                attrs: ['mec', 'cmp'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.35, 0.30, 0.90), when: 'ahead',
            }),
            opt('sweep', 'Sweep your own side so they cannot do it to you', {
                attrs: ['map'], difficulty: 0.34, reward: 7, risk: 5,
                bias: bias(0.25, 0.25, 0.80), when: 'behind',
            }),
        ], 1.2),

    ev('mid_l_ult', 'late',
        'Your ultimate is up and it is the only thing standing between them and your nexus.',
        [
            opt('save', 'Hold it for the engage you know is coming', {
                attrs: ['cmp', 'knw'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.40, 0.50, 0.85),
            }),
            opt('open', 'Open with it and start the fight yourself', {
                attrs: ['tmf'], difficulty: 0.68, reward: 13, risk: 12,
                bias: bias(0.95, 0.85, 0.80), when: 'even',
            }),
            opt('wave', 'Use it to clear the wave and buy thirty seconds', {
                attrs: ['lne'], difficulty: 0.30, reward: 6, risk: 5,
                bias: bias(0.20, 0.25, 0.70), when: 'struggling',
            }),
        ], 1.3),

    ev('mid_l_baron', 'late',
        'Baron is being started and you are the only one with vision of it.',
        [
            opt('contest', 'Contest it directly', {
                attrs: ['tmf', 'cmp'], difficulty: 0.74, reward: 13, risk: 12,
                bias: bias(0.90, 0.90, 0.85),
            }),
            opt('call', 'Call the timing and let the jungler make the play', {
                attrs: ['ldr', 'knw'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.55, 0.60, 1.00),
            }),
            opt('trade', 'Trade it for their base while they are all in the pit', {
                attrs: ['lne', 'map'], difficulty: 0.60, reward: 12, risk: 10,
                bias: bias(0.65, 0.85, 0.45), when: 'even',
            }),
        ], 1.2),

    ev('mid_l_carry', 'late',
        'Their carry is fed, unkillable in a straight fight, and standing four hundred units too far forward.',
        [
            opt('burst', 'Go for the burst', {
                attrs: ['mec'], difficulty: 0.80, reward: 14, risk: 13,
                bias: bias(1.00, 0.95, 0.35), when: 'fed',
            }),
            opt('zone', 'Zone him out and win the four on four behind it', {
                attrs: ['tmf', 'knw'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.50, 0.45, 0.95),
            }),
            opt('avoid', 'Refuse the fight and take the objective instead', {
                attrs: ['ldr', 'map'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.35, 0.40, 0.70), when: 'behind',
            }),
        ], 1.1),

    ev('mid_l_close', 'late',
        'You are one fight from ending it and they have not shown on the map for twenty seconds.',
        [
            opt('push', 'Push mid as five and force it', {
                attrs: ['ldr', 'tmf'], difficulty: 0.62, reward: 12, risk: 11,
                bias: bias(0.85, 0.80, 0.95), when: 'ahead',
            }),
            opt('vision', 'Get vision first and take the fight on your terms', {
                attrs: ['map', 'cmp'], difficulty: 0.48, reward: 10, risk: 7,
                bias: bias(0.45, 0.40, 0.90),
            }),
            opt('split', 'Send someone side and make them answer it', {
                attrs: ['ldr', 'knw'], difficulty: 0.54, reward: 11, risk: 9,
                bias: bias(0.60, 0.70, 0.60),
            }),
        ], 1.2),
];

// ---------------------------------------------------------------------------
//  ADC
//  Two hundred gold behind is a different champion. Positioning is the job.
// ---------------------------------------------------------------------------
export const ADC_EVENTS = [
    // --- early -------------------------------------------------------------
    ev('adc_e_lvl2', 'early',
        'Their support walked up for a ward at level two and your support has flash.',
        [
            opt('engage', 'Commit to the all-in behind your support', {
                attrs: ['mec', 'tmf'], difficulty: 0.58, reward: 11, risk: 10,
                bias: bias(0.90, 0.80, 0.85), when: 'even',
            }),
            opt('poke', 'Auto him twice and take the free trade', {
                attrs: ['lne'], difficulty: 0.36, reward: 7, risk: 5,
                bias: bias(0.60, 0.35, 0.55),
            }),
            opt('wave', 'Ignore him and hit level two first', {
                attrs: ['lne', 'knw'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.30, 0.25, 0.40),
            }),
        ], 1.3),

    ev('adc_e_freeze', 'early',
        'They are freezing just outside your tower range and your support keeps walking up alone.',
        [
            opt('break', 'Break the freeze with a hard shove', {
                attrs: ['lne'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.60, 0.55, 0.50), when: 'behind',
            }),
            opt('safe', 'Take what you can reach and give up the rest', {
                attrs: ['cmp', 'lne'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.20, 0.20, 0.45), when: 'struggling',
            }),
            opt('jungle', 'Call the jungler and turn the freeze into a fight', {
                attrs: ['ldr', 'tmf'], difficulty: 0.56, reward: 10, risk: 9,
                bias: bias(0.75, 0.65, 0.95),
            }),
            opt('roam', 'Leave it and take the scuttle with your support', {
                attrs: ['map'], difficulty: 0.44, reward: 8, risk: 7,
                bias: bias(0.55, 0.55, 0.75),
            }),
        ], 1.1),

    ev('adc_e_dive', 'early',
        'You are two waves ahead with a plate up and their jungler has shown top twice.',
        [
            opt('dive', 'Dive them under tower with your support', {
                attrs: ['mec', 'tmf'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.90, 0.85, 0.80), when: 'ahead',
            }),
            opt('plates', 'Take the plates and stay safe doing it', {
                attrs: ['lne'], difficulty: 0.34, reward: 8, risk: 5,
                bias: bias(0.45, 0.30, 0.35),
            }),
            opt('recall', 'Crash it, recall, and come back on the item spike', {
                attrs: ['knw'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.45),
            }),
        ], 1.2),

    ev('adc_e_cs', 'early',
        'Six minions are dying under your tower and their mid is walking down the river.',
        [
            opt('greed', 'Get all six', {
                attrs: ['mec'], difficulty: 0.66, reward: 9, risk: 10,
                bias: bias(0.55, 0.85, 0.15),
            }),
            opt('some', 'Take the safe three and back off', {
                attrs: ['lne', 'map'], difficulty: 0.34, reward: 6, risk: 4,
                bias: bias(0.30, 0.30, 0.55),
            }),
            opt('reset', 'Give the whole wave and reset the lane', {
                attrs: ['cmp'], difficulty: 0.24, reward: 5, risk: 3,
                bias: bias(0.15, 0.15, 0.50), when: 'struggling',
            }),
        ]),

    ev('adc_e_2v2', 'early',
        'The 2v2 is even, both supports are out of mana, and you are up one auto in the trade.',
        [
            opt('press', 'Press the advantage now', {
                attrs: ['mec', 'lne'], difficulty: 0.60, reward: 10, risk: 9,
                bias: bias(0.85, 0.70, 0.60), when: 'even',
            }),
            opt('reset', 'Reset the wave and take the tempo instead', {
                attrs: ['lne', 'knw'], difficulty: 0.38, reward: 7, risk: 5,
                bias: bias(0.40, 0.35, 0.50),
            }),
            opt('back', 'Back out and come back with the component', {
                attrs: ['knw'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.20, 0.20, 0.40),
            }),
        ], 1.1),

    // --- mid ---------------------------------------------------------------
    ev('adc_m_flank', 'mid',
        'You are one item ahead but their Nautilus is flanking through mid. Your support just died on vision.',
        [
            opt('back', 'Give up the wave and reposition behind your team', {
                attrs: ['map', 'cmp'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.25, 0.30, 0.70), when: 'behind',
            }),
            opt('hold', 'Hold the wave and trust your positioning', {
                attrs: ['mec', 'map'], difficulty: 0.70, reward: 12, risk: 12,
                bias: bias(0.65, 0.85, 0.25),
            }),
            opt('bait', 'Stand just inside his range and bait the engage', {
                attrs: ['cmp', 'tmf'], difficulty: 0.78, reward: 13, risk: 12,
                bias: bias(0.80, 0.90, 0.85),
            }),
            opt('group', 'Walk to your team and take the objective as five', {
                attrs: ['ldr'], difficulty: 0.36, reward: 8, risk: 5,
                bias: bias(0.35, 0.30, 0.95),
            }),
        ], 1.3),

    ev('adc_m_drake', 'mid',
        'Dragon is being contested and you are the only one who can actually kill it quickly.',
        [
            opt('damage', 'Stand in the pit and burn it down', {
                attrs: ['mec', 'cmp'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.70, 0.75, 0.85),
            }),
            opt('safe', 'Hit it from the entrance and give up the DPS', {
                attrs: ['map', 'tmf'], difficulty: 0.44, reward: 9, risk: 6,
                bias: bias(0.35, 0.35, 0.80), when: 'even',
            }),
            opt('side', 'Skip it and take the free side wave', {
                attrs: ['lne'], difficulty: 0.32, reward: 7, risk: 5,
                bias: bias(0.35, 0.35, 0.20), when: 'behind',
            }),
        ], 1.2),

    ev('adc_m_siege', 'mid',
        'You are sieging a tower and their engage support is holding a flash you cannot see.',
        [
            opt('hit', 'Keep hitting it and take the tower', {
                attrs: ['mec', 'cmp'], difficulty: 0.60, reward: 11, risk: 10,
                bias: bias(0.70, 0.75, 0.55),
            }),
            opt('range', 'Only hit it from behind your own frontline', {
                attrs: ['tmf', 'map'], difficulty: 0.46, reward: 9, risk: 6,
                bias: bias(0.40, 0.35, 0.85),
            }),
            opt('rotate', 'Leave it, rotate, and make them defend somewhere else', {
                attrs: ['ldr', 'map'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.50, 0.55, 0.75), when: 'ahead',
            }),
        ], 1.1),

    ev('adc_m_item', 'mid',
        'You are eight hundred gold from the item that makes this matchup make sense.',
        [
            opt('farm', 'Farm the side lane until you have it', {
                attrs: ['lne', 'knw'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.35, 0.40, 0.30),
            }),
            opt('fight', 'Take the fight without it and hope your team carries the gap', {
                attrs: ['tmf', 'cmp'], difficulty: 0.72, reward: 12, risk: 12,
                bias: bias(0.85, 0.85, 0.90),
            }),
            opt('cross', 'Take their jungle camps to get there faster', {
                attrs: ['map', 'knw'], difficulty: 0.56, reward: 10, risk: 9,
                bias: bias(0.60, 0.75, 0.35), when: 'even',
            }),
        ]),

    ev('adc_m_pick', 'mid',
        'Their jungler walks into your vision alone and your team is already pinging it.',
        [
            opt('commit', 'Commit and burst him down', {
                attrs: ['mec', 'tmf'], difficulty: 0.64, reward: 11, risk: 10,
                bias: bias(0.90, 0.80, 0.80), when: 'fed',
            }),
            opt('follow', 'Follow only as far as your support does', {
                attrs: ['map', 'tmf'], difficulty: 0.44, reward: 9, risk: 6,
                bias: bias(0.55, 0.45, 0.95),
            }),
            opt('stay', 'Stay on the wave and let them have it', {
                attrs: ['lne'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.20, 0.20, 0.25), when: 'behind',
            }),
        ], 1.2),

    // --- late --------------------------------------------------------------
    ev('adc_l_baron', 'late',
        "Baron is down and they are pushing mid as five. You have no Zhonya's and their assassin is unaccounted for.",
        [
            opt('defend', 'Hold the line and DPS from max range', {
                attrs: ['mec', 'cmp'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.50, 0.60, 0.90), when: 'struggling',
            }),
            opt('base', 'Sit behind the inhibitor turret and refuse to step out', {
                attrs: ['cmp', 'tmf'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.20, 0.30, 0.85), when: 'behind',
            }),
            opt('trade', 'Leave the base and take their bot inhibitor instead', {
                attrs: ['map', 'lne'], difficulty: 0.76, reward: 14, risk: 13,
                bias: bias(0.80, 0.95, 0.20),
            }),
            opt('flank', 'Walk the long way and take the fight from their side', {
                attrs: ['map', 'tmf'], difficulty: 0.82, reward: 14, risk: 13,
                bias: bias(0.90, 0.95, 0.60),
            }),
        ], 1.3),

    ev('adc_l_elder', 'late',
        'Elder is up, you are the win condition, and both teams know exactly where you are standing.',
        [
            opt('patient', 'Stay behind everything and wait for the frontline to break', {
                attrs: ['cmp', 'tmf'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.35, 0.40, 0.95),
            }),
            opt('early', 'Start hitting them the second they are in range', {
                attrs: ['mec'], difficulty: 0.74, reward: 13, risk: 12,
                bias: bias(0.90, 0.85, 0.60), when: 'even',
            }),
            opt('pit', 'Get in the pit and end the objective before the fight resolves', {
                attrs: ['mec', 'cmp'], difficulty: 0.80, reward: 14, risk: 13,
                bias: bias(0.75, 0.95, 0.80),
            }),
        ], 1.2),

    ev('adc_l_kite', 'late',
        'Their diver lands on you in the middle of the fight and your support is on the far side of it.',
        [
            opt('kite', 'Kite backwards and keep the damage going', {
                attrs: ['mec', 'cmp'], difficulty: 0.72, reward: 12, risk: 11,
                bias: bias(0.60, 0.70, 0.55),
            }),
            opt('flash', 'Flash out immediately and reset the angle', {
                attrs: ['map', 'cmp'], difficulty: 0.50, reward: 9, risk: 8,
                bias: bias(0.30, 0.45, 0.60), when: 'behind',
            }),
            opt('turn', 'Turn on him and race it', {
                attrs: ['mec'], difficulty: 0.86, reward: 14, risk: 14,
                bias: bias(1.00, 0.95, 0.25), when: 'fed',
            }),
        ], 1.2),

    ev('adc_l_split', 'late',
        'Both bot inhibitors are open and the next fight is the last one either team gets.',
        [
            opt('group', 'Group and take the fight with your team', {
                attrs: ['tmf', 'ldr'], difficulty: 0.52, reward: 11, risk: 9,
                bias: bias(0.60, 0.50, 1.00),
            }),
            opt('push', 'Push the side wave and be late but ahead', {
                attrs: ['lne', 'map'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.55, 0.85, 0.15), when: 'ahead',
            }),
            opt('vision', 'Ward the fight for them and hold position behind it', {
                attrs: ['map', 'cmp'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.30, 0.30, 0.90),
            }),
        ], 1.1),

    ev('adc_l_race', 'late',
        'They are on your nexus turrets and you are on theirs, and it comes down to who hits faster.',
        [
            opt('race', 'Race it and never look back', {
                attrs: ['mec', 'cmp'], difficulty: 0.68, reward: 14, risk: 13,
                bias: bias(0.85, 1.00, 0.40), when: 'even',
            }),
            opt('back', 'Turn around and defend', {
                attrs: ['tmf', 'map'], difficulty: 0.54, reward: 10, risk: 9,
                bias: bias(0.35, 0.35, 0.95), when: 'behind',
            }),
            opt('count', 'Do the maths on the timers before committing to either', {
                attrs: ['knw', 'cmp'], difficulty: 0.60, reward: 12, risk: 10,
                bias: bias(0.45, 0.55, 0.80),
            }),
        ], 1.2),
];

// ---------------------------------------------------------------------------
//  SUP
//  Vision, timing, and being right about things nobody notices.
// ---------------------------------------------------------------------------
export const SUP_EVENTS = [
    // --- early -------------------------------------------------------------
    ev('sup_e_lvl2', 'early',
        'Their jungler pathed top and you have a level two spike. Your ADC is a Draven.',
        [
            opt('allin', 'Walk up and start the all-in', {
                attrs: ['tmf', 'mec'], difficulty: 0.60, reward: 11, risk: 10,
                bias: bias(0.95, 0.80, 0.85), when: 'even',
            }),
            opt('zone', 'Zone them off the wave without committing', {
                attrs: ['lne', 'map'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.65, 0.45, 0.70),
            }),
            opt('ward', 'Use the window to get deep vision instead', {
                attrs: ['map', 'knw'], difficulty: 0.34, reward: 7, risk: 4,
                bias: bias(0.30, 0.35, 0.75),
            }),
        ], 1.3),

    ev('sup_e_vision', 'early',
        'Their jungler has not been seen since the second buff and your ADC is standing in the middle of the lane.',
        [
            opt('deep', 'Put a ward in their raptors and find him', {
                attrs: ['map'], difficulty: 0.52, reward: 9, risk: 8,
                bias: bias(0.55, 0.65, 0.85),
            }),
            opt('safe', 'Ward the river and pull your ADC back', {
                attrs: ['map', 'ldr'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.25, 0.20, 0.90),
            }),
            opt('trade', 'Ignore it and take the trade you have right now', {
                attrs: ['lne', 'tmf'], difficulty: 0.58, reward: 10, risk: 9,
                bias: bias(0.85, 0.75, 0.55),
            }),
        ], 1.2),

    ev('sup_e_roam', 'early',
        'The wave is crashing, your ADC is recalling, and their mid laner has no flash.',
        [
            opt('roam', 'Roam mid', {
                attrs: ['map', 'tmf'], difficulty: 0.54, reward: 10, risk: 8,
                bias: bias(0.80, 0.70, 0.85), when: 'even',
            }),
            opt('vision', 'Set the dragon pit up before anyone asks for it', {
                attrs: ['map', 'knw'], difficulty: 0.36, reward: 7, risk: 5,
                bias: bias(0.35, 0.30, 0.85),
            }),
            opt('lane', 'Stay and hold the wave for him', {
                attrs: ['lne'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.30, 0.20, 0.75),
            }),
        ], 1.2),

    ev('sup_e_save', 'early',
        'Their jungler comes bot, your ADC is too far forward, and you have one summoner that solves it.',
        [
            opt('save', 'Spend it and get him out', {
                attrs: ['tmf', 'cmp'], difficulty: 0.56, reward: 10, risk: 8,
                bias: bias(0.40, 0.55, 1.00),
            }),
            opt('turn', 'Turn on the gank instead', {
                attrs: ['mec', 'tmf'], difficulty: 0.80, reward: 14, risk: 13,
                bias: bias(1.00, 0.95, 0.70),
            }),
            opt('body', 'Body block and take the damage yourself', {
                attrs: ['cmp', 'tmf'], difficulty: 0.48, reward: 9, risk: 8,
                bias: bias(0.55, 0.70, 1.00), when: 'behind',
            }),
        ], 1.1),

    ev('sup_e_prio', 'early',
        'Scuttle is spawning, your lane has prio, and your jungler is nowhere near it.',
        [
            opt('go', 'Walk up and take it yourself', {
                attrs: ['map', 'ldr'], difficulty: 0.50, reward: 9, risk: 8,
                bias: bias(0.70, 0.70, 0.80), when: 'even',
            }),
            opt('ward', 'Ward it, tell your jungler, and go back to lane', {
                attrs: ['map', 'knw'], difficulty: 0.32, reward: 7, risk: 4,
                bias: bias(0.30, 0.25, 0.90),
            }),
            opt('shove', 'Shove the wave in and make it their problem', {
                attrs: ['lne'], difficulty: 0.36, reward: 7, risk: 5,
                bias: bias(0.50, 0.40, 0.55),
            }),
        ]),

    // --- mid ---------------------------------------------------------------
    ev('sup_m_roam', 'mid',
        'Your mid is roaming bot and the enemy wave is shoved. Vision on dragon is dead.',
        [
            opt('pit', 'Go re-establish the pit vision alone', {
                attrs: ['map', 'cmp'], difficulty: 0.58, reward: 11, risk: 10,
                bias: bias(0.50, 0.75, 0.90),
            }),
            opt('with', 'Go with him and make it a three man play', {
                attrs: ['tmf', 'ldr'], difficulty: 0.54, reward: 11, risk: 9,
                bias: bias(0.85, 0.70, 0.95), when: 'even',
            }),
            opt('adc', 'Stay with your ADC and hold the side', {
                attrs: ['lne', 'map'], difficulty: 0.36, reward: 7, risk: 5,
                bias: bias(0.30, 0.25, 0.80),
            }),
            opt('sweep', 'Sweep their vision on the way instead of placing your own', {
                attrs: ['knw', 'map'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.45, 0.50, 0.75), when: 'ahead',
            }),
        ], 1.3),

    ev('sup_m_engage', 'mid',
        'They are walking to the pit in a line and you have the engage that decides whether this is a fight.',
        [
            opt('go', 'Start it now', {
                attrs: ['tmf', 'mec'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.95, 0.85, 0.90), when: 'even',
            }),
            opt('hold', 'Hold it until their frontline commits first', {
                attrs: ['cmp', 'knw'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.45, 0.45, 0.90),
            }),
            opt('pick', 'Wait for the one at the back to walk too far', {
                attrs: ['map', 'tmf'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.80, 0.85, 0.70),
            }),
        ], 1.3),

    ev('sup_m_ward', 'mid',
        'Baron is up in two minutes and neither team has vision anywhere near it.',
        [
            opt('deep', 'Go set it up now while nobody is looking', {
                attrs: ['map', 'cmp'], difficulty: 0.60, reward: 11, risk: 10,
                bias: bias(0.55, 0.80, 0.90),
            }),
            opt('team', 'Wait and do it with the team on the next reset', {
                attrs: ['ldr', 'knw'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.35, 0.30, 1.00),
            }),
            opt('deny', 'Sweep their half of the river and deny instead', {
                attrs: ['knw', 'map'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.50, 0.55, 0.80), when: 'ahead',
            }),
        ], 1.2),

    ev('sup_m_peel', 'mid',
        'The fight has started and both your carry and your top laner need you at the same time.',
        [
            opt('carry', 'Peel for the carry and let top figure it out', {
                attrs: ['tmf'], difficulty: 0.48, reward: 10, risk: 8,
                bias: bias(0.35, 0.40, 0.95),
            }),
            opt('front', 'Go forward with your top laner and commit to the dive', {
                attrs: ['tmf', 'cmp'], difficulty: 0.68, reward: 12, risk: 11,
                bias: bias(0.90, 0.85, 0.80),
            }),
            opt('split', 'Try to hold the middle and cover both', {
                attrs: ['tmf', 'knw'], difficulty: 0.74, reward: 12, risk: 12,
                bias: bias(0.60, 0.70, 0.95),
            }),
        ], 1.2),

    ev('sup_m_call', 'mid',
        'Nobody is talking, the dragon timer is at twenty seconds, and somebody has to make a call.',
        [
            opt('lead', 'Make it and be loud about it', {
                attrs: ['ldr', 'knw'], difficulty: 0.54, reward: 11, risk: 9,
                bias: bias(0.70, 0.60, 1.00),
            }),
            opt('setup', 'Say nothing and just walk the vision in', {
                attrs: ['map'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.35, 0.40, 0.75),
            }),
            opt('safe', 'Call it off and take the side lanes instead', {
                attrs: ['ldr', 'cmp'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.25, 0.30, 0.85), when: 'behind',
            }),
        ], 1.1),

    // --- late --------------------------------------------------------------
    ev('sup_l_save', 'late',
        'You have one save left and both your carries are out of position.',
        [
            opt('adc', 'Spend it on the ADC and accept the other one dies', {
                attrs: ['tmf', 'knw'], difficulty: 0.54, reward: 11, risk: 9,
                bias: bias(0.40, 0.50, 0.95), when: 'even',
            }),
            opt('hold', 'Hold it and trust them to walk out on their own', {
                attrs: ['cmp', 'knw'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.35, 0.85, 0.60),
            }),
            opt('both', 'Position between them and try to cover both', {
                attrs: ['tmf', 'cmp'], difficulty: 0.82, reward: 14, risk: 13,
                bias: bias(0.55, 0.90, 1.00),
            }),
            opt('engage', 'Forget saving and start a fight they have to answer', {
                attrs: ['tmf', 'mec'], difficulty: 0.76, reward: 13, risk: 13,
                bias: bias(1.00, 0.90, 0.85), when: 'struggling',
            }),
        ], 1.3),

    ev('sup_l_pit', 'late',
        'Elder is contested and their engage support is standing exactly where you want to be.',
        [
            opt('first', 'Take the angle first and force him to react', {
                attrs: ['tmf', 'mec'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.95, 0.90, 0.85),
            }),
            opt('mirror', 'Mirror him and hold your cooldown for his', {
                attrs: ['cmp', 'knw'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.45, 0.50, 0.90), when: 'ahead',
            }),
            opt('vision', 'Give up the position and win the vision instead', {
                attrs: ['map'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.30, 0.35, 0.85),
            }),
        ], 1.2),

    ev('sup_l_pick', 'late',
        'Their carry has walked into your side of the fog and nobody else has noticed yet.',
        [
            opt('go', 'Go now and take him yourself', {
                attrs: ['mec', 'tmf'], difficulty: 0.76, reward: 13, risk: 12,
                bias: bias(1.00, 0.95, 0.50),
            }),
            opt('call', 'Hold vision on him and call the collapse', {
                attrs: ['ldr', 'map'], difficulty: 0.50, reward: 11, risk: 8,
                bias: bias(0.65, 0.55, 1.00), when: 'even',
            }),
            opt('leave', 'Leave him and keep your team in position for Baron', {
                attrs: ['knw', 'cmp'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.25, 0.30, 0.80), when: 'ahead',
            }),
        ], 1.2),

    ev('sup_l_defend', 'late',
        'They are in your base, your ADC has one item on you, and the wave is about to hit the nexus turrets.',
        [
            opt('hold', 'Hold the choke and buy every second you can', {
                attrs: ['cmp', 'tmf'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.45, 0.55, 1.00), when: 'struggling',
            }),
            opt('engage', 'Start the fight before they get set up', {
                attrs: ['tmf', 'mec'], difficulty: 0.78, reward: 14, risk: 13,
                bias: bias(1.00, 0.95, 0.85),
            }),
            opt('wave', 'Clear the wave and let them do nothing', {
                attrs: ['lne', 'knw'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.25, 0.30, 0.75), when: 'behind',
            }),
        ], 1.2),

    ev('sup_l_vision', 'late',
        'The game has been stalled for four minutes and whoever wins the next vision fight wins the game.',
        [
            opt('deep', 'Walk into their jungle alone and set it up', {
                attrs: ['map', 'cmp'], difficulty: 0.74, reward: 13, risk: 12,
                bias: bias(0.60, 0.90, 0.85),
            }),
            opt('escort', 'Take two people with you and do it properly', {
                attrs: ['ldr', 'map'], difficulty: 0.52, reward: 11, risk: 9,
                bias: bias(0.55, 0.50, 1.00),
            }),
            opt('own', 'Lock down your own half and refuse to be picked', {
                attrs: ['map', 'knw'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.20, 0.25, 0.85), when: 'behind',
            }),
        ], 1.1),
];

// ---------------------------------------------------------------------------
//  LOOKUP
// ---------------------------------------------------------------------------

/** Every pool, keyed by role id. MID doubles as the fallback. */
export const DECISION_POOLS = {
    TOP: TOP_EVENTS,
    JNG: JNG_EVENTS,
    MID: MID_EVENTS,
    ADC: ADC_EVENTS,
    SUP: SUP_EVENTS,
};

/**
 * The pool for a role, optionally narrowed to one phase.
 *
 * Never returns an empty array. An unknown role id falls back to MID, and a
 * phase with nothing in it falls back to the whole pool - the match engine
 * always has something to deal, even if a future edit empties a bucket.
 */
export function eventsForRole(roleId, phase) {
    const key = typeof roleId === 'string' ? roleId.toUpperCase() : '';
    const pool = DECISION_POOLS[key] || MID_EVENTS;
    if (!phase) return pool.slice();
    const narrowed = pool.filter(e => e.phase === phase);
    return narrowed.length ? narrowed : pool.slice();
}

/** Every event in the game, flat. For tooling, counts and debug screens. */
export function allEvents() {
    const out = [];
    for (const key of Object.keys(DECISION_POOLS)) {
        for (const e of DECISION_POOLS[key]) out.push(e);
    }
    return out;
}
