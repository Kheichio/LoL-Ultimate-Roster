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

    // --- early, second pass -------------------------------------------------------------
    ev('top_e_cheater', 'early',
        'You crash the third wave into his tower a beat before he can match it, and your first item is thirty gold away.',
        [
            opt('back', 'Recall now and beat him back to the lane', {
                attrs: ['lne', 'knw'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.40, 0.35, 0.65), when: 'even',
            }),
            opt('more', 'Stay for one more wave and back with the item', {
                attrs: ['lne'], difficulty: 0.52, reward: 9, risk: 7,
                bias: bias(0.55, 0.70, 0.30),
            }),
            opt('push', 'Skip the back and set up a slow push instead', {
                attrs: ['lne', 'cmp'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.45, 0.45, 0.70),
            }),
            opt('deny', 'Sit on him under the tower and deny the wave', {
                attrs: ['mec', 'lne'], difficulty: 0.68, reward: 11, risk: 10,
                bias: bias(0.90, 0.80, 0.30),
            }),
        ], 1.1),

    ev('top_e_proxy', 'early',
        'Their jungler has been top twice already and the wave is shoving itself into their tower. You could walk past it and live behind them.',
        [
            opt('proxy', 'Proxy between their towers and let them come find you', {
                attrs: ['map', 'cmp'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.75, 0.95, 0.40),
            }),
            opt('ward', 'Ward both entrances and farm your own half', {
                attrs: ['map'], difficulty: 0.30, reward: 5, risk: 4,
                bias: bias(0.30, 0.25, 0.75),
            }),
            opt('swap', 'Call for a lane swap and take the bottom side', {
                attrs: ['ldr', 'tmf'], difficulty: 0.46, reward: 8, risk: 6,
                bias: bias(0.35, 0.40, 1.00), when: 'struggling',
            }),
        ], 0.8),

    ev('top_e_counter', 'early',
        'He picked into you and every trade so far has gone one way. You are two waves off your first item and he is not.',
        [
            opt('farm', 'Give the wave up and farm what you can under tower', {
                attrs: ['lne'], difficulty: 0.24, reward: 4, risk: 3,
                bias: bias(0.20, 0.20, 0.75), when: 'struggling',
            }),
            opt('ask', 'Ask your jungler for one early look at the lane', {
                attrs: ['ldr', 'tmf'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.55, 0.45, 0.95),
            }),
            opt('spike', 'Hold the wave and fight him on your level spike', {
                attrs: ['knw', 'lne'], difficulty: 0.56, reward: 9, risk: 8,
                bias: bias(0.70, 0.60, 0.45), when: 'even',
            }),
            opt('flash', 'Burn Flash to make one all-in stick', {
                attrs: ['mec'], difficulty: 0.76, reward: 12, risk: 12,
                bias: bias(0.95, 0.90, 0.20),
            }),
        ]),

    ev('top_e_bait', 'early',
        'Their jungler cleared his top side last and your wave is sitting in front of your tower with no ward down anywhere.',
        [
            opt('bait', 'Stand in the wave, let him commit, and fight it out', {
                attrs: ['cmp', 'mec'], difficulty: 0.72, reward: 12, risk: 11,
                bias: bias(0.85, 0.90, 0.60), when: 'even',
            }),
            opt('ping', 'Ping it early and pull your jungler top', {
                attrs: ['ldr'], difficulty: 0.40, reward: 7, risk: 5,
                bias: bias(0.40, 0.35, 1.00),
            }),
            opt('back', 'Step back and let the wave bounce off your tower', {
                attrs: ['lne', 'map'], difficulty: 0.33, reward: 6, risk: 4,
                bias: bias(0.35, 0.25, 0.75),
            }),
        ], 0.9),

    ev('top_e_firstback', 'early',
        'You are back with nine hundred gold and the shop open. He is a level up and their jungler owns your half of the river.',
        [
            opt('defensive', 'Buy the defensive component and settle for even', {
                attrs: ['knw'], difficulty: 0.26, reward: 5, risk: 3,
                bias: bias(0.30, 0.25, 0.75),
            }),
            opt('damage', 'Buy the damage and look for a kill on the walk back', {
                attrs: ['knw', 'mec'], difficulty: 0.58, reward: 10, risk: 9,
                bias: bias(0.85, 0.80, 0.20), when: 'even',
            }),
            opt('vision', 'Spend it on control wards and boots', {
                attrs: ['map', 'tmf'], difficulty: 0.38, reward: 6, risk: 4,
                bias: bias(0.35, 0.30, 1.00),
            }),
            opt('hold', 'Hold the gold, walk mid and look for a play', {
                attrs: ['map', 'ldr'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.60, 0.65, 0.90), when: 'ahead',
            }),
        ]),

    ev('top_e_plate', 'early',
        'You killed him and his Teleport is up. Four plates are left and he can be standing on the lane again in forty seconds.',
        [
            opt('plates', 'Hit plates until he lands on top of you', {
                attrs: ['lne', 'cmp'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.60, 0.65, 0.40),
            }),
            opt('two', 'Take two and back before the Teleport comes down', {
                attrs: ['lne'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.45, 0.25, 0.70), when: 'ahead',
            }),
            opt('river', 'Shove it in and walk to the river for the scuttle', {
                attrs: ['map', 'tmf'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.55, 0.50, 0.95),
            }),
            opt('minion', 'Kill the minion he tries to Teleport to', {
                attrs: ['mec', 'knw'], difficulty: 0.66, reward: 11, risk: 10,
                bias: bias(0.75, 0.80, 0.45),
            }),
        ], 1.1),

    ev('top_e_even', 'early',
        'Your jungler has written the lane off and he has started walking at you every time his abilities come back up.',
        [
            opt('concede', 'Concede the wave and match his back timings', {
                attrs: ['lne', 'cmp'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.30, 0.25, 0.75),
            }),
            opt('punish', 'Punish one walk-up and reset the lane state', {
                attrs: ['mec', 'lne'], difficulty: 0.54, reward: 9, risk: 8,
                bias: bias(0.75, 0.60, 0.50), when: 'even',
            }),
            opt('camp', 'Shove into the tower and take a camp on your side', {
                attrs: ['map', 'knw'], difficulty: 0.46, reward: 8, risk: 6,
                bias: bias(0.55, 0.50, 0.70), when: 'behind',
            }),
        ], 1.2),

    // --- mid ---------------------------------------------------------------,

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

    // --- mid, second pass ---------------------------------------------------------------
    ev('top_m_towers', 'mid',
        'He is halfway through your second tower and you are halfway through his. Neither of you has turned around yet.',
        [
            opt('race', 'Keep hitting and win the trade by one hit', {
                attrs: ['lne', 'cmp'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.65, 0.75, 0.45), when: 'even',
            }),
            opt('turn', 'Turn around and get back before yours falls', {
                attrs: ['map'], difficulty: 0.36, reward: 6, risk: 5,
                bias: bias(0.35, 0.30, 0.90), when: 'behind',
            }),
            opt('deeper', 'Leave both and walk at the inhibitor turret', {
                attrs: ['cmp', 'lne'], difficulty: 0.74, reward: 13, risk: 12,
                bias: bias(0.80, 0.95, 0.15),
            }),
        ], 1.2),

    ev('top_m_duel', 'mid',
        'He walks into the side lane alone with his ultimate up and yours on cooldown. The wave is dead even between you.',
        [
            opt('duel', 'Take the duel anyway', {
                attrs: ['mec'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.95, 0.85, 0.25), when: 'fed',
            }),
            opt('farm', 'Farm the wave and refuse the fight', {
                attrs: ['lne', 'cmp'], difficulty: 0.41, reward: 7, risk: 5,
                bias: bias(0.40, 0.35, 0.70),
            }),
            opt('tower', 'Bait him under your tower and turn there', {
                attrs: ['knw', 'mec'], difficulty: 0.60, reward: 10, risk: 9,
                bias: bias(0.70, 0.65, 0.60), when: 'even',
            }),
            opt('help', 'Hold him in the lane and ping for help', {
                attrs: ['ldr', 'tmf'], difficulty: 0.54, reward: 9, risk: 8,
                bias: bias(0.50, 0.55, 1.00),
            }),
        ], 1.1),

    ev('top_m_group', 'mid',
        'Four pings on the minimap and a message in chat telling you to come mid. Your wave is one crash from the inhibitor turret.',
        [
            opt('group', 'Give the wave up and walk mid with them', {
                attrs: ['tmf'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.45, 0.25, 1.00),
            }),
            opt('finish', 'Crash it first and take the turret', {
                attrs: ['lne', 'cmp'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.65, 0.80, 0.15), when: 'ahead',
            }),
            opt('hold', 'Tell them to hold mid until your wave lands', {
                attrs: ['ldr', 'knw'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.45, 0.55, 0.90),
            }),
        ]),

    ev('top_m_lostfight', 'mid',
        'The fight in the mid lane is already two down and your Teleport is up. There are four seconds on the channel.',
        [
            opt('tpin', 'Teleport in and try to save what is left of it', {
                attrs: ['tmf', 'mec'], difficulty: 0.72, reward: 12, risk: 12,
                bias: bias(0.85, 0.90, 1.00),
            }),
            opt('cancel', 'Cancel it and hold Teleport for the next one', {
                attrs: ['cmp', 'map'], difficulty: 0.38, reward: 7, risk: 5,
                bias: bias(0.35, 0.35, 0.65),
            }),
            opt('side', 'Let it go and take their side lane while they reset', {
                attrs: ['lne', 'map'], difficulty: 0.50, reward: 9, risk: 8,
                bias: bias(0.55, 0.60, 0.45), when: 'behind',
            }),
        ], 0.9),

    ev('top_m_drake', 'mid',
        'The third drake is being set up and your side wave is worth more than the drake is. Nobody has asked you to come.',
        [
            opt('stay', 'Stay on the wave and let them do it four on five', {
                attrs: ['lne', 'knw'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.45, 0.60, 0.40), when: 'ahead',
            }),
            opt('come', 'Drop the wave and be there for the fight', {
                attrs: ['tmf', 'map'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.50, 0.35, 1.00),
            }),
            opt('pressure', 'Push into his tower so they have to answer it', {
                attrs: ['lne', 'cmp'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.75, 0.85, 0.60),
            }),
        ], 1.2),

    ev('top_m_catch', 'mid',
        'A cannon wave is about to hit your tier two while everyone walks to the Herald pit. You are the only one close enough.',
        [
            opt('clear', 'Clear it and arrive at the pit late', {
                attrs: ['lne', 'map'], difficulty: 0.35, reward: 6, risk: 4,
                bias: bias(0.40, 0.35, 0.75),
            }),
            opt('leave', 'Leave the wave and be on time for the fight', {
                attrs: ['tmf'], difficulty: 0.48, reward: 9, risk: 7,
                bias: bias(0.55, 0.55, 1.00), when: 'even',
            }),
            opt('both', 'Clear it fast and Teleport straight into the pit', {
                attrs: ['map', 'tmf'], difficulty: 0.68, reward: 12, risk: 10,
                bias: bias(0.65, 0.80, 0.90),
            }),
        ]),

    ev('top_m_tilt', 'mid',
        'Your jungler has died on your side twice and is now typing about it. The next fifteen seconds decide whether comms recover.',
        [
            opt('call', 'Cut it off and give the team one clear call', {
                attrs: ['ldr', 'cmp'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.40, 0.25, 1.00),
            }),
            opt('quiet', 'Say nothing and play your own game', {
                attrs: ['cmp'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.45, 0.45, 0.20),
            }),
            opt('take', 'Take the shotcalling off him for the rest of the game', {
                attrs: ['ldr', 'knw'], difficulty: 0.62, reward: 11, risk: 9,
                bias: bias(0.60, 0.70, 0.90), when: 'struggling',
            }),
        ], 0.8),

    // --- late --------------------------------------------------------------,

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

    // --- late, second pass --------------------------------------------------------------
    ev('top_l_backdoor', 'late',
        'Their four are grouped mid and you are standing in their base with a full wave in front of you and nothing warded behind.',
        [
            opt('nexus', 'Hit the nexus turrets and see how long you get', {
                attrs: ['cmp', 'lne'], difficulty: 0.78, reward: 15, risk: 14,
                bias: bias(0.85, 1.00, 0.20),
            }),
            opt('inhib', 'Take the inhibitor and get out', {
                attrs: ['lne', 'cmp'], difficulty: 0.58, reward: 11, risk: 10,
                bias: bias(0.65, 0.70, 0.70), when: 'even',
            }),
            opt('stall', 'Tell your team to hold mid and buy you the timer', {
                attrs: ['ldr', 'tmf'], difficulty: 0.46, reward: 9, risk: 8,
                bias: bias(0.40, 0.45, 1.00),
            }),
        ], 0.9),

    ev('top_l_timers', 'late',
        'Two of theirs are dead on fifty-second timers and Baron is up. Your team wants to start it this second.',
        [
            opt('now', 'Start it now and spend the fifty seconds', {
                attrs: ['tmf', 'knw'], difficulty: 0.56, reward: 11, risk: 10,
                bias: bias(0.70, 0.75, 0.90), when: 'ahead',
            }),
            opt('wait', 'Clear their vision and wait for the wave to push in', {
                attrs: ['map', 'cmp'], difficulty: 0.40, reward: 8, risk: 7,
                bias: bias(0.40, 0.30, 0.90),
            }),
            opt('side', 'Send yourself to the side lane while they hold it', {
                attrs: ['lne', 'map'], difficulty: 0.66, reward: 13, risk: 12,
                bias: bias(0.55, 0.85, 0.40),
            }),
        ], 1.1),

    ev('top_l_lastman', 'late',
        'Four of yours are dead on long timers and you are alive in their bottom jungle with nobody looking for you.',
        [
            opt('wave', 'Walk home and clear the super wave off your base', {
                attrs: ['lne', 'cmp'], difficulty: 0.48, reward: 9, risk: 8,
                bias: bias(0.30, 0.35, 1.00),
            }),
            opt('turret', 'Take their exposed inhibitor turret while they Baron', {
                attrs: ['lne', 'map'], difficulty: 0.68, reward: 13, risk: 12,
                bias: bias(0.75, 0.90, 0.45),
            }),
            opt('pit', 'Face-check the pit and give your team the timer', {
                attrs: ['map', 'tmf'], difficulty: 0.62, reward: 11, risk: 11,
                bias: bias(0.60, 0.80, 1.00),
            }),
            opt('fog', 'Sit in the fog and wait for the respawns', {
                attrs: ['cmp'], difficulty: 0.50, reward: 8, risk: 6,
                bias: bias(0.25, 0.25, 0.70), when: 'behind',
            }),
        ], 0.8),

    ev('top_l_soul', 'late',
        'Soul point drake in twenty seconds and their top laner has just recalled. Your side wave is three minions from his tower.',
        [
            opt('pit', 'Leave the wave and be at the pit on time', {
                attrs: ['tmf', 'map'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.50, 0.35, 1.00),
            }),
            opt('trade', 'Trade the drake for the base turret', {
                attrs: ['lne', 'cmp'], difficulty: 0.64, reward: 12, risk: 12,
                bias: bias(0.70, 0.90, 0.15), when: 'behind',
            }),
            opt('flank', 'Cross through their jungle and flank the pit', {
                attrs: ['map', 'tmf'], difficulty: 0.72, reward: 14, risk: 13,
                bias: bias(0.90, 0.85, 0.85),
            }),
        ], 1.2),
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

    // --- early, second pass -------------------------------------------------------------
    ev('jng_e_fullclear', 'early',
        'Their jungler is on a three camp path and will be topside at three minutes. You started the opposite way round.',
        [
            opt('match', 'Mirror his path and meet him there at three', {
                attrs: ['map', 'knw'], difficulty: 0.52, reward: 9, risk: 8,
                bias: bias(0.60, 0.55, 0.80), when: 'even',
            }),
            opt('clear', 'Finish the full clear and come out a level up', {
                attrs: ['knw'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.25, 0.20, 0.35),
            }),
            opt('cross', 'Cross behind him and take his bottom side while he walks', {
                attrs: ['map', 'cmp'], difficulty: 0.66, reward: 11, risk: 10,
                bias: bias(0.70, 0.85, 0.25),
            }),
        ], 1.1),

    ev('jng_e_crab', 'early',
        'Both mid laners have been missing for twenty seconds and the scuttle in your river is still up.',
        [
            opt('take', 'Take it fast and burn flash if you have to', {
                attrs: ['mec'], difficulty: 0.55, reward: 9, risk: 8,
                bias: bias(0.75, 0.70, 0.55),
            }),
            opt('back', 'Back off it and ward the entrance instead', {
                attrs: ['map'], difficulty: 0.26, reward: 5, risk: 3,
                bias: bias(0.20, 0.20, 0.55),
            }),
            opt('bush', 'Sit in the tri bush and let them start it first', {
                attrs: ['map', 'cmp'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.65, 0.80, 0.60), when: 'even',
            }),
            opt('other', 'Give it and be first to the other one', {
                attrs: ['knw', 'map'], difficulty: 0.38, reward: 7, risk: 5,
                bias: bias(0.35, 0.35, 0.60), when: 'struggling',
            }),
        ], 1.2),

    ev('jng_e_toolate', 'early',
        'Your top laner is pinging for help with a wave shoved into his tower and their jungler already on the way. You are four camps and a river away.',
        [
            opt('go', 'Path top anyway and hope he lives long enough', {
                attrs: ['mec', 'tmf'], difficulty: 0.68, reward: 11, risk: 11,
                bias: bias(0.80, 0.85, 0.90),
            }),
            opt('ping', 'Tell him to give the wave and walk away', {
                attrs: ['ldr'], difficulty: 0.24, reward: 5, risk: 3,
                bias: bias(0.20, 0.15, 0.70),
            }),
            opt('trade', 'Ignore it and take everything on the other side of the map', {
                attrs: ['knw', 'map'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.45, 0.50, 0.20), when: 'behind',
            }),
        ]),

    ev('jng_e_lostinvade', 'early',
        'The level one invade went badly. You are on ninety health, down a camp, and their jungler is somewhere behind you.',
        [
            opt('reset', 'Walk to base, buy, and restart the clear clean', {
                attrs: ['knw'], difficulty: 0.33, reward: 6, risk: 4,
                bias: bias(0.20, 0.20, 0.50),
            }),
            opt('borrow', 'Ask your bot lane for a leash and keep pathing', {
                attrs: ['ldr', 'tmf'], difficulty: 0.46, reward: 8, risk: 6,
                bias: bias(0.40, 0.45, 0.85), when: 'struggling',
            }),
            opt('back', 'Turn straight back around into the camp he is on', {
                attrs: ['mec', 'cmp'], difficulty: 0.71, reward: 12, risk: 12,
                bias: bias(0.95, 0.90, 0.30),
            }),
        ], 0.9),

    ev('jng_e_donate', 'early',
        'Your mid laner has died twice and is nine creeps down. Your raptors and your wolves are both up and you do not need either of them.',
        [
            opt('give', 'Hand him the camps and take the loss of tempo', {
                attrs: ['ldr', 'tmf'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.30, 0.35, 1.00), when: 'struggling',
            }),
            opt('keep', 'Take them yourself and play the map from ahead', {
                attrs: ['knw'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.35, 0.30, 0.15),
            }),
            opt('dive', 'Spend the tempo on a dive to get him even instead', {
                attrs: ['tmf', 'mec'], difficulty: 0.63, reward: 11, risk: 10,
                bias: bias(0.85, 0.80, 0.85),
            }),
        ], 0.8),

    ev('jng_e_countergank', 'early',
        'You are already in the lane bush for a gank and their jungler arrives from the other side. Both laners are still at full health.',
        [
            opt('commit', 'Go anyway and turn it into a two on two', {
                attrs: ['mec', 'tmf'], difficulty: 0.64, reward: 11, risk: 10,
                bias: bias(0.90, 0.80, 0.85), when: 'even',
            }),
            opt('wait', 'Hold in the bush until he commits first', {
                attrs: ['cmp', 'map'], difficulty: 0.52, reward: 9, risk: 8,
                bias: bias(0.55, 0.65, 0.70),
            }),
            opt('leave', 'Back out and take the camps he walked away from', {
                attrs: ['knw', 'map'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.30, 0.30, 0.45),
            }),
        ], 1.1),

    ev('jng_e_leash', 'early',
        'Both side lanes want the leash and their support is already standing in your bottom side jungle watching where you start.',
        [
            opt('top', 'Start top side and let bot walk out on their own', {
                attrs: ['knw', 'map'], difficulty: 0.28, reward: 5, risk: 4,
                bias: bias(0.30, 0.30, 0.55),
            }),
            opt('fake', 'Fake the start, walk him off, then take the other buff', {
                attrs: ['map', 'cmp'], difficulty: 0.60, reward: 10, risk: 8,
                bias: bias(0.55, 0.70, 0.60),
            }),
            opt('contest', 'Bring your bot lane and take the fight in the bush', {
                attrs: ['tmf', 'ldr'], difficulty: 0.63, reward: 11, risk: 11,
                bias: bias(0.90, 0.90, 0.95), when: 'even',
            }),
        ], 0.9),

    // --- mid ---------------------------------------------------------------,

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

    // --- mid, second pass ---------------------------------------------------------------
    ev('jng_m_herald', 'mid',
        'You have been carrying the Herald eye for four minutes. Top tower is at half health and mid tower has not been touched.',
        [
            opt('top', 'Drop it top and walk away with the plates', {
                attrs: ['knw'], difficulty: 0.34, reward: 7, risk: 4,
                bias: bias(0.35, 0.30, 0.70),
            }),
            opt('mid', 'Force it mid with everyone and take the first tower there', {
                attrs: ['ldr', 'tmf'], difficulty: 0.56, reward: 10, risk: 9,
                bias: bias(0.65, 0.60, 0.95), when: 'even',
            }),
            opt('bait', 'Hold it as a threat and use it to open the dragon pit', {
                attrs: ['map', 'cmp'], difficulty: 0.68, reward: 12, risk: 11,
                bias: bias(0.60, 0.85, 0.75),
            }),
        ], 1.2),

    ev('jng_m_crossmap', 'mid',
        'Their four are already in the dragon pit and Herald spawns on the other side of the map in ten seconds.',
        [
            opt('herald', 'Take Herald and let the dragon go', {
                attrs: ['knw', 'map'], difficulty: 0.38, reward: 8, risk: 5,
                bias: bias(0.40, 0.45, 0.70), when: 'behind',
            }),
            opt('contest', 'Cross and contest the pit with the two you have', {
                attrs: ['tmf', 'cmp'], difficulty: 0.70, reward: 13, risk: 12,
                bias: bias(0.90, 0.90, 0.85),
            }),
            opt('steal', 'Sit above the pit and play only for the smite', {
                attrs: ['mec', 'cmp'], difficulty: 0.74, reward: 13, risk: 12,
                bias: bias(0.70, 0.95, 0.45),
            }),
        ], 1.1),

    ev('jng_m_camps', 'mid',
        'Their red buff has been up for a minute and your sweeper came back clean through both entrances.',
        [
            opt('take', 'Take the buff and walk out the long way', {
                attrs: ['map', 'knw'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.55, 0.65, 0.30), when: 'ahead',
            }),
            opt('own', 'Leave it and take your own camps on tempo', {
                attrs: ['knw'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.25, 0.20, 0.55),
            }),
            opt('camp', 'Take it and stay in there waiting for him to come back', {
                attrs: ['cmp', 'mec'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.95, 0.90, 0.25),
            }),
        ], 0.9),

    ev('jng_m_winning', 'mid',
        'Your bot lane is up two kills and shoving. Your top laner is down thirty creeps and asking for a gank on the same timer.',
        [
            opt('bot', 'Play to the winning side and take the dragon off it', {
                attrs: ['knw', 'ldr'], difficulty: 0.42, reward: 9, risk: 6,
                bias: bias(0.55, 0.45, 0.75), when: 'ahead',
            }),
            opt('top', 'Go top and try to get the losing lane back into the game', {
                attrs: ['tmf', 'mec'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.70, 0.70, 0.95), when: 'struggling',
            }),
            opt('neither', 'Take neither and clear the camps between them', {
                attrs: ['knw'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.50),
            }),
        ]),

    ev('jng_m_track', 'mid',
        'Their jungler has not been on a screen for ninety seconds and every ward you own is on cooldown.',
        [
            opt('assume', 'Assume he is topside and play the bottom half of the map', {
                attrs: ['knw', 'map'], difficulty: 0.36, reward: 7, risk: 5,
                bias: bias(0.35, 0.40, 0.65),
            }),
            opt('find', 'Walk in and find him yourself', {
                attrs: ['map', 'cmp'], difficulty: 0.67, reward: 12, risk: 11,
                bias: bias(0.80, 0.90, 0.50),
            }),
            opt('call', 'Pull the whole team to one objective and dare him to show', {
                attrs: ['ldr', 'tmf'], difficulty: 0.54, reward: 10, risk: 8,
                bias: bias(0.55, 0.55, 1.00), when: 'even',
            }),
        ]),

    ev('jng_m_reset', 'mid',
        'The map is dead even, both junglers are on the same clear, and you have eleven hundred gold unspent.',
        [
            opt('back', 'Reset now and come back with the item spike first', {
                attrs: ['knw'], difficulty: 0.40, reward: 8, risk: 5,
                bias: bias(0.35, 0.30, 0.65),
            }),
            opt('hold', 'Hold the gold and keep the pressure on their side', {
                attrs: ['map', 'cmp'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.70, 0.75, 0.55), when: 'ahead',
            }),
            opt('call', 'Call the whole team to reset together and group after', {
                attrs: ['ldr'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.40, 0.45, 1.00),
            }),
        ], 0.8),

    ev('jng_m_tilt', 'mid',
        'Your mid laner has died three times, is typing in all chat, and has started walking at people alone.',
        [
            opt('cover', 'Say nothing and quietly path around him for ten minutes', {
                attrs: ['knw', 'map'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.30, 0.35, 0.60),
            }),
            opt('talk', 'Take the comms and give him something simple to do', {
                attrs: ['ldr', 'tmf'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.35, 0.40, 1.00),
            }),
            opt('use', 'Let him keep walking in and play off what he draws', {
                attrs: ['cmp', 'map'], difficulty: 0.64, reward: 12, risk: 11,
                bias: bias(0.75, 0.85, 0.35), when: 'behind',
            }),
        ], 0.9),

    // --- late --------------------------------------------------------------,

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

    // --- late, second pass --------------------------------------------------------------
    ev('jng_l_elder', 'late',
        'Elder spawns in twenty seconds. Their jungler is two levels up on you and neither team has swept the pit.',
        [
            opt('sweep', 'Sweep the pit and set it up properly before anyone commits', {
                attrs: ['map', 'knw'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.35, 0.35, 0.90),
            }),
            opt('fight', 'Start the fight above the pit and never let it be smited', {
                attrs: ['tmf', 'ldr'], difficulty: 0.64, reward: 12, risk: 11,
                bias: bias(0.90, 0.80, 0.95), when: 'ahead',
            }),
            opt('smite', 'Sit under it and take the smite you are probably losing', {
                attrs: ['mec', 'cmp'], difficulty: 0.80, reward: 15, risk: 14,
                bias: bias(0.75, 1.00, 0.70),
            }),
        ], 1.2),

    ev('jng_l_baitcarry', 'late',
        'Baron will not draw them unless they think somebody is out of position. Your ADC is the fastest thing on your team and knows it.',
        [
            opt('bait', 'Put him in the river alone and start Baron the moment they bite', {
                attrs: ['ldr', 'cmp'], difficulty: 0.70, reward: 14, risk: 13,
                bias: bias(0.75, 0.95, 0.80), when: 'even',
            }),
            opt('honest', 'Start it honestly with five and smite it fast', {
                attrs: ['mec', 'tmf'], difficulty: 0.58, reward: 12, risk: 10,
                bias: bias(0.65, 0.60, 0.95),
            }),
            opt('wait', 'Do not touch it and take the two side towers instead', {
                attrs: ['knw', 'map'], difficulty: 0.46, reward: 10, risk: 7,
                bias: bias(0.40, 0.35, 0.75),
            }),
        ]),

    ev('jng_l_catch', 'late',
        'Their top laner is alone on the far side lane with an inhibitor wave behind him and your four are holding mid.',
        [
            opt('go', 'Leave mid and go and kill him yourself', {
                attrs: ['mec', 'map'], difficulty: 0.63, reward: 12, risk: 11,
                bias: bias(0.95, 0.85, 0.20), when: 'fed',
            }),
            opt('stay', 'Stay with the four and hold the wave with them', {
                attrs: ['tmf'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.35, 0.30, 0.95),
            }),
            opt('ward', 'Ward his path out and let your top laner match him', {
                attrs: ['ldr', 'map'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.45, 0.45, 0.85),
            }),
        ], 0.9),

    ev('jng_l_siege', 'late',
        'Your four are sieging their second tower and nobody has asked where you are. Baron is up in ninety seconds.',
        [
            opt('join', 'Walk into the siege and make it a five man push', {
                attrs: ['tmf', 'ldr'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.55, 0.45, 1.00),
            }),
            opt('vision', 'Spend the whole ninety seconds setting the Baron pit up', {
                attrs: ['map', 'knw'], difficulty: 0.54, reward: 11, risk: 9,
                bias: bias(0.40, 0.50, 0.85),
            }),
            opt('flank', 'Path behind them and wait in their base for the collapse', {
                attrs: ['cmp', 'map'], difficulty: 0.74, reward: 14, risk: 13,
                bias: bias(0.90, 0.95, 0.70), when: 'ahead',
            }),
        ]),
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

    // --- early, second pass -------------------------------------------------------------
    ev('mid_e_six', 'early',
        'You both hit six in the same second. He is on eighty per cent health and standing on the wrong side of his wave.',
        [
            opt('allin', 'Ult him and commit everything you have', {
                attrs: ['mec'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.95, 0.90, 0.25),
            }),
            opt('shove', 'Shove the wave and keep the ultimate for a roam', {
                attrs: ['lne', 'map'], difficulty: 0.32, reward: 7, risk: 5,
                bias: bias(0.45, 0.35, 0.80),
            }),
            opt('poke', 'Chip him down first and see if he backs off', {
                attrs: ['lne', 'cmp'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.55, 0.40, 0.35), when: 'even',
            }),
        ], 1.2),

    ev('mid_e_scuttle', 'early',
        'Your jungler is walking to the bottom scuttle and asking for prio. Your wave is halfway back to your own tower.',
        [
            opt('shove', 'Push it under his tower and get down there', {
                attrs: ['lne', 'map'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.65, 0.60, 0.95),
            }),
            opt('ward', 'Give the crab up and ward his topside instead', {
                attrs: ['map'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.25, 0.25, 0.80),
            }),
            opt('fight', 'Tell him to start it and arrive on top of them', {
                attrs: ['ldr', 'tmf'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.90, 0.85, 0.90), when: 'even',
            }),
        ], 1.1),

    ev('mid_e_unpushable', 'early',
        'He clears the wave faster than you can and you have not been able to leave the lane since level three.',
        [
            opt('accept', 'Farm what you can reach and hold the level', {
                attrs: ['lne', 'cmp'], difficulty: 0.34, reward: 6, risk: 4,
                bias: bias(0.20, 0.20, 0.45),
            }),
            opt('slow', 'Build it up and leave on the crash instead', {
                attrs: ['lne', 'knw'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.45, 0.55, 0.70), when: 'even',
            }),
            opt('jungler', 'Have your jungler clear it for you and go', {
                attrs: ['ldr', 'map'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.50, 0.45, 1.00),
            }),
            opt('walk', 'Walk at him with no prio and make something happen', {
                attrs: ['mec'], difficulty: 0.76, reward: 13, risk: 12,
                bias: bias(1.00, 0.95, 0.20),
            }),
        ], 1.0),

    ev('mid_e_toproam', 'early',
        'Top is shoved to their tower and their top laner has no flash. Bot lane is dead even and pinging for you.',
        [
            opt('top', 'Walk top and take the free kill', {
                attrs: ['map', 'mec'], difficulty: 0.54, reward: 11, risk: 8,
                bias: bias(0.80, 0.70, 0.85), when: 'ahead',
            }),
            opt('bot', 'Go where your team is asking you to go', {
                attrs: ['ldr', 'tmf'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.55, 0.45, 1.00),
            }),
            opt('stay', 'Stay mid and keep your own lane in front of you', {
                attrs: ['lne'], difficulty: 0.29, reward: 6, risk: 4,
                bias: bias(0.25, 0.20, 0.25),
            }),
        ], 1.0),

    ev('mid_e_back', 'early',
        'You have enough gold for your component. He is one wave off his first item and you are both on half health.',
        [
            opt('back', 'Back now and come back with the item first', {
                attrs: ['knw'], difficulty: 0.24, reward: 5, risk: 3,
                bias: bias(0.25, 0.20, 0.55),
            }),
            opt('stay', 'Stay two more waves and buy the bigger spike', {
                attrs: ['lne', 'cmp'], difficulty: 0.56, reward: 11, risk: 10,
                bias: bias(0.55, 0.80, 0.35), when: 'even',
            }),
            opt('deny', 'Shove it in so that he cannot back either', {
                attrs: ['lne', 'map'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.70, 0.55, 0.70),
            }),
        ], 1.1),

    ev('mid_e_dive', 'early',
        'Their jungler and their support are both walking at you under tower and you have one wave of minions between you.',
        [
            opt('flash', 'Flash out early and give up the plate', {
                attrs: ['map', 'cmp'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.15, 0.20, 0.60),
            }),
            opt('kite', 'Kite the tower and make them eat three shots', {
                attrs: ['mec', 'cmp'], difficulty: 0.68, reward: 12, risk: 11,
                bias: bias(0.70, 0.85, 0.65),
            }),
            opt('turn', 'Stand your ground and turn on whoever tanks it', {
                attrs: ['mec', 'tmf'], difficulty: 0.80, reward: 14, risk: 13,
                bias: bias(1.00, 0.95, 0.30), when: 'fed',
            }),
            opt('call', 'Call your own jungler in behind them', {
                attrs: ['ldr'], difficulty: 0.48, reward: 10, risk: 8,
                bias: bias(0.60, 0.60, 1.00),
            }),
        ], 1.1),

    ev('mid_e_bounce', 'early',
        'You crashed the wave too early and it is coming back at you with two more behind it.',
        [
            opt('reset', 'Let it bounce and reset the lane where you want it', {
                attrs: ['lne'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.30, 0.25, 0.45),
            }),
            opt('catch', 'Meet it in the middle and hold it there', {
                attrs: ['lne', 'knw'], difficulty: 0.46, reward: 9, risk: 6,
                bias: bias(0.45, 0.45, 0.55), when: 'ahead',
            }),
            opt('leave', 'Leave it entirely and set up on the topside', {
                attrs: ['map'], difficulty: 0.40, reward: 8, risk: 7,
                bias: bias(0.55, 0.60, 0.85), when: 'even',
            }),
        ], 0.9),

    // --- mid ---------------------------------------------------------------,

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

    // --- mid, second pass ---------------------------------------------------------------
    ev('mid_m_tower', 'mid',
        'They are hitting your mid tower and you are hitting theirs, and neither team looks like turning around first.',
        [
            opt('race', 'Keep hitting and win the trade by one tower', {
                attrs: ['lne', 'cmp'], difficulty: 0.50, reward: 11, risk: 9,
                bias: bias(0.75, 0.80, 0.75), when: 'even',
            }),
            opt('home', 'Turn around and defend your own', {
                attrs: ['tmf'], difficulty: 0.36, reward: 7, risk: 5,
                bias: bias(0.25, 0.25, 0.80),
            }),
            opt('greed', 'Take theirs and walk into their jungle behind it', {
                attrs: ['map', 'cmp'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.85, 0.95, 0.60),
            }),
        ], 1.2),

    ev('mid_m_hold', 'mid',
        'Their support is out of position on the way to drake. Your ultimate deletes him now, or it opens the fight in a minute.',
        [
            opt('pick', 'Spend it now and take him out of the fight', {
                attrs: ['mec', 'map'], difficulty: 0.60, reward: 12, risk: 10,
                bias: bias(0.85, 0.80, 0.80), when: 'even',
            }),
            opt('hold', 'Hold it and open the fight with it instead', {
                attrs: ['cmp', 'knw'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.40, 0.40, 0.85),
            }),
            opt('wave', 'Put it into the wave and be there with it back up', {
                attrs: ['lne'], difficulty: 0.34, reward: 7, risk: 5,
                bias: bias(0.25, 0.30, 0.70),
            }),
        ], 1.1),

    ev('mid_m_follow', 'mid',
        'Their mid vanished off the map thirty seconds ago and your bot lane has still not backed off.',
        [
            opt('follow', 'Track him bot and be there when it happens', {
                attrs: ['map', 'tmf'], difficulty: 0.52, reward: 11, risk: 9,
                bias: bias(0.70, 0.65, 0.95),
            }),
            opt('ping', 'Ping the danger and take the free mid tower', {
                attrs: ['lne', 'ldr'], difficulty: 0.40, reward: 9, risk: 7,
                bias: bias(0.55, 0.55, 0.60), when: 'ahead',
            }),
            opt('hunt', 'Walk into their jungle and find him yourself', {
                attrs: ['map', 'mec'], difficulty: 0.70, reward: 13, risk: 12,
                bias: bias(0.90, 0.90, 0.40),
            }),
            opt('safe', 'Stay mid and keep the wave where you can see it', {
                attrs: ['lne'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.20, 0.20, 0.35),
            }),
        ], 1.2),

    ev('mid_m_standoff', 'mid',
        'Ten people are stood around the drake pit and nobody has thrown a spell in forty seconds.',
        [
            opt('poke', 'Start chipping at whoever is standing closest', {
                attrs: ['mec', 'cmp'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.65, 0.50, 0.85),
            }),
            opt('flank', 'Peel off and take the long way round behind them', {
                attrs: ['map'], difficulty: 0.64, reward: 12, risk: 11,
                bias: bias(0.85, 0.90, 0.50),
            }),
            opt('wave', 'Send the wave in and make them deal with it', {
                attrs: ['lne', 'ldr'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.35, 0.35, 0.90), when: 'even',
            }),
        ], 1.2),

    ev('mid_m_duel', 'mid',
        'You are two levels up on their mid and he has walked into the side lane on his own.',
        [
            opt('duel', 'Go and kill him', {
                attrs: ['mec', 'lne'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.90, 0.75, 0.30), when: 'fed',
            }),
            opt('cut', 'Cut him off from his own tower first', {
                attrs: ['map', 'knw'], difficulty: 0.68, reward: 13, risk: 11,
                bias: bias(0.85, 0.85, 0.55),
            }),
            opt('ignore', 'Leave him and take the objective he has left', {
                attrs: ['ldr', 'map'], difficulty: 0.32, reward: 7, risk: 5,
                bias: bias(0.30, 0.30, 0.85),
            }),
        ], 1.0),

    ev('mid_m_catch', 'mid',
        'Your team is holding mid in a five on five standoff and there are three waves stacked in the bottom lane.',
        [
            opt('go', 'Slip out and take the whole side lane', {
                attrs: ['lne', 'map'], difficulty: 0.54, reward: 11, risk: 10,
                bias: bias(0.45, 0.75, 0.15),
            }),
            opt('stay', 'Stay in the group and hold the numbers', {
                attrs: ['tmf'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.30, 0.25, 1.00),
            }),
            opt('send', 'Send someone else and take their side instead', {
                attrs: ['ldr', 'knw'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.45, 0.50, 0.90), when: 'ahead',
            }),
            opt('deep', 'Take the side lane and keep walking into their base', {
                attrs: ['cmp', 'map'], difficulty: 0.78, reward: 14, risk: 13,
                bias: bias(0.90, 1.00, 0.20),
            }),
        ], 1.0),

    ev('mid_m_comms', 'mid',
        'Your jungler has died three times in ten minutes and has stopped talking on comms.',
        [
            opt('lead', 'Take the calls yourself for the next five minutes', {
                attrs: ['ldr'], difficulty: 0.52, reward: 11, risk: 8,
                bias: bias(0.45, 0.40, 1.00),
            }),
            opt('quiet', 'Say nothing and play your own game cleanly', {
                attrs: ['cmp'], difficulty: 0.42, reward: 8, risk: 5,
                bias: bias(0.30, 0.25, 0.25),
            }),
            opt('walk', 'Walk his jungle with him and get a camp back', {
                attrs: ['map', 'ldr'], difficulty: 0.58, reward: 11, risk: 10,
                bias: bias(0.60, 0.65, 0.95), when: 'struggling',
            }),
        ], 0.8),

    // --- late --------------------------------------------------------------,

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

    // --- late, second pass --------------------------------------------------------------
    ev('mid_l_inhib', 'late',
        'The bottom inhibitor turret is on its last bar and four of them are stood in the Baron pit. Nobody else gets there in time.',
        [
            opt('defend', 'Go alone and hold the inhibitor', {
                attrs: ['lne', 'cmp'], difficulty: 0.50, reward: 10, risk: 9,
                bias: bias(0.35, 0.60, 0.75),
            }),
            opt('group', 'Give the inhibitor and contest the Baron as five', {
                attrs: ['tmf', 'ldr'], difficulty: 0.46, reward: 11, risk: 9,
                bias: bias(0.60, 0.65, 1.00),
            }),
            opt('trade', 'Ignore both and push the top lane into their base', {
                attrs: ['map', 'knw'], difficulty: 0.64, reward: 13, risk: 12,
                bias: bias(0.55, 0.90, 0.20), when: 'behind',
            }),
        ], 1.2),

    ev('mid_l_nexus', 'late',
        'You are inside their base, the nexus turrets are down to one, and three of them respawn in eleven seconds.',
        [
            opt('hit', 'Ignore everything and hit the nexus', {
                attrs: ['cmp', 'tmf'], difficulty: 0.68, reward: 15, risk: 14,
                bias: bias(0.85, 1.00, 0.70), when: 'ahead',
            }),
            opt('clear', 'Kill the two who are still alive first', {
                attrs: ['tmf', 'mec'], difficulty: 0.50, reward: 12, risk: 10,
                bias: bias(0.75, 0.55, 0.90),
            }),
            opt('leave', 'Back out with the inhibitor and reset for the next one', {
                attrs: ['knw', 'ldr'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.25, 0.20, 0.85),
            }),
        ], 1.2),

    ev('mid_l_elder', 'late',
        'Elder is thirty seconds out and both teams are stacked on the same side of the pit.',
        [
            opt('open', 'Open the fight the moment they step in', {
                attrs: ['tmf'], difficulty: 0.62, reward: 13, risk: 12,
                bias: bias(0.95, 0.85, 0.85),
            }),
            opt('hold', 'Hold your ultimate for the second wave of it', {
                attrs: ['cmp', 'knw'], difficulty: 0.54, reward: 12, risk: 10,
                bias: bias(0.50, 0.55, 0.80), when: 'even',
            }),
            opt('zone', 'Use it to cut the pit off and win the smite', {
                attrs: ['map', 'tmf'], difficulty: 0.72, reward: 14, risk: 13,
                bias: bias(0.80, 0.95, 0.95),
            }),
            opt('sit', 'Stay out of range and let them commit first', {
                attrs: ['cmp'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.20, 0.25, 0.65),
            }),
        ], 1.2),

    ev('mid_l_grey', 'late',
        'You are dead for fifty seconds and the death cam is showing you their whole team walking mid.',
        [
            opt('call', 'Call the disengage and keep the other four alive', {
                attrs: ['ldr', 'map'], difficulty: 0.56, reward: 12, risk: 9,
                bias: bias(0.30, 0.35, 1.00),
            }),
            opt('baron', 'Tell them to start Baron while you walk back', {
                attrs: ['ldr', 'knw'], difficulty: 0.70, reward: 14, risk: 13,
                bias: bias(0.80, 0.95, 0.90), when: 'ahead',
            }),
            opt('quiet', 'Say nothing and let them play it out', {
                attrs: ['cmp'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.35, 0.30, 0.40),
            }),
        ], 0.9),
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

    // --- early, second pass -------------------------------------------------------------
    ev('adc_e_bully', 'early',
        'Their Draven has both axes up and walks at you every wave. You cannot win a single auto-attack trade until your first component.',
        [
            opt('concede', 'Give up the first three waves and farm from under the tower', {
                attrs: ['cmp', 'lne'], difficulty: 0.28, reward: 5, risk: 4,
                bias: bias(0.15, 0.20, 0.55),
            }),
            opt('punish', 'Punish him the moment he drops an axe', {
                attrs: ['mec', 'lne'], difficulty: 0.62, reward: 10, risk: 9,
                bias: bias(0.80, 0.75, 0.60), when: 'even',
            }),
            opt('gank', 'Bring the jungler down before the lead becomes permanent', {
                attrs: ['ldr', 'tmf'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.70, 0.50, 0.95),
            }),
        ], 1.2),

    ev('adc_e_vision', 'early',
        'The wave is pushing to you and the river has been dark since the first back. You are the only one on the team still holding a ward.',
        [
            opt('ward', 'Walk into the river and place it yourself', {
                attrs: ['map'], difficulty: 0.38, reward: 7, risk: 6,
                bias: bias(0.40, 0.50, 0.90),
            }),
            opt('cs', 'Stay on the wave and take every minion', {
                attrs: ['lne', 'mec'], difficulty: 0.24, reward: 5, risk: 3,
                bias: bias(0.30, 0.35, 0.20),
            }),
            opt('tri', 'Shove through and ward their tribush on the way out', {
                attrs: ['map', 'lne'], difficulty: 0.66, reward: 10, risk: 10,
                bias: bias(0.75, 0.85, 0.80), when: 'ahead',
            }),
        ], 0.9),

    ev('adc_e_gank', 'early',
        'Your jungler pings bot at three minutes. The wave is sitting on their side of the lane and both of them are full health.',
        [
            opt('wave', 'Shove it in first and take the gank on the next wave', {
                attrs: ['lne', 'knw'], difficulty: 0.30, reward: 6, risk: 4,
                bias: bias(0.40, 0.25, 0.60),
            }),
            opt('go', 'Walk at them now and make it work', {
                attrs: ['mec', 'tmf'], difficulty: 0.64, reward: 11, risk: 10,
                bias: bias(0.90, 0.80, 0.85), when: 'even',
            }),
            opt('redirect', 'Send him into their jungle and take the camps for tempo', {
                attrs: ['map', 'ldr'], difficulty: 0.52, reward: 9, risk: 8,
                bias: bias(0.65, 0.60, 0.70), when: 'ahead',
            }),
            opt('refuse', 'Tell him to leave bot alone and keep farming', {
                attrs: ['cmp', 'ldr'], difficulty: 0.36, reward: 6, risk: 5,
                bias: bias(0.20, 0.20, 0.45),
            }),
        ], 1.1),

    ev('adc_e_recall', 'early',
        'You crash the wave a beat early with just enough gold for the component. Both of them stayed to clear it.',
        [
            opt('cheat', 'Recall on the crash and beat them back to lane', {
                attrs: ['knw', 'lne'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.50, 0.55, 0.60),
            }),
            opt('stay', 'Stay for one more wave and back on a bigger number', {
                attrs: ['lne'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.25, 0.25, 0.50),
            }),
            opt('greed', 'Skip the base entirely and take a plate while they walk', {
                attrs: ['mec', 'lne'], difficulty: 0.64, reward: 10, risk: 10,
                bias: bias(0.75, 0.90, 0.30), when: 'ahead',
            }),
        ]),

    ev('adc_e_spells', 'early',
        'Their support has ignite and their carry has exhaust. You took heal and it is worth nothing in an all-in against both of them.',
        [
            opt('avoid', 'Play outside all-in range until one of them is spent', {
                attrs: ['knw', 'cmp'], difficulty: 0.32, reward: 6, risk: 4,
                bias: bias(0.25, 0.20, 0.55),
            }),
            opt('bait', 'Bait the exhaust with a short trade and then commit', {
                attrs: ['cmp', 'mec'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.85, 0.85, 0.75), when: 'even',
            }),
            opt('level', 'Play for the level lead and fight only at six', {
                attrs: ['lne', 'knw'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.50, 0.35, 0.60),
            }),
        ], 0.8),

    ev('adc_e_hold', 'early',
        'First drake spawns in forty seconds and the wave is three minions deep on their side.',
        [
            opt('slowpush', 'Hold it, build the slow push, and arrive late with a wave behind you', {
                attrs: ['lne', 'knw'], difficulty: 0.54, reward: 10, risk: 8,
                bias: bias(0.50, 0.55, 0.70),
            }),
            opt('leave', 'Leave the wave and get to the pit on time', {
                attrs: ['map', 'tmf'], difficulty: 0.33, reward: 7, risk: 5,
                bias: bias(0.40, 0.30, 0.90),
            }),
            opt('shove', 'Shove it under their tower and take the drake two minions down', {
                attrs: ['lne', 'mec'], difficulty: 0.46, reward: 8, risk: 7,
                bias: bias(0.65, 0.60, 0.75), when: 'even',
            }),
        ]),

    ev('adc_e_start', 'early',
        'Your support flashes in and hooks their carry without saying a word. You are two minions off level three.',
        [
            opt('commit', 'Go with him and turn it into a kill', {
                attrs: ['mec', 'tmf'], difficulty: 0.56, reward: 10, risk: 9,
                bias: bias(0.85, 0.75, 0.95),
            }),
            opt('refuse', 'Stay on the wave and let him own the consequences', {
                attrs: ['lne', 'cmp'], difficulty: 0.30, reward: 6, risk: 5,
                bias: bias(0.20, 0.25, 0.15),
            }),
            opt('half', 'Walk up for two autos and leave before it turns', {
                attrs: ['cmp', 'lne'], difficulty: 0.48, reward: 8, risk: 6,
                bias: bias(0.65, 0.45, 0.70), when: 'behind',
            }),
            opt('level', 'Take level three off the wave first, then commit', {
                attrs: ['knw', 'mec'], difficulty: 0.66, reward: 11, risk: 10,
                bias: bias(0.75, 0.80, 0.80), when: 'even',
            }),
        ], 1.1),

    // --- mid ---------------------------------------------------------------,

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

    // --- mid, second pass ---------------------------------------------------------------
    ev('adc_m_choke', 'mid',
        'The siege has stalled at their mid inhibitor turret and the only angle onto the wave is through the choke.',
        [
            opt('wall', 'Hit the wave from behind the wall and give up the turret damage', {
                attrs: ['map', 'cmp'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.35, 0.30, 0.80),
            }),
            opt('step', 'Step into the choke and get the turret to half', {
                attrs: ['mec', 'cmp'], difficulty: 0.68, reward: 12, risk: 12,
                bias: bias(0.85, 0.85, 0.65),
            }),
            opt('reset', 'Call the reset and take the drake instead', {
                attrs: ['ldr', 'map'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.40, 0.40, 0.95), when: 'even',
            }),
        ], 1.2),

    ev('adc_m_save', 'mid',
        'Your support gets caught warding the pit and is at a third health with two of them on him.',
        [
            opt('go', 'Walk in and buy him the seconds he needs', {
                attrs: ['tmf', 'mec'], difficulty: 0.62, reward: 11, risk: 11,
                bias: bias(0.80, 0.90, 1.00),
            }),
            opt('let', 'Let him die and take the objective while they collect', {
                attrs: ['map', 'knw'], difficulty: 0.34, reward: 8, risk: 5,
                bias: bias(0.35, 0.35, 0.15),
            }),
            opt('range', 'Threaten from max range and see if that is enough', {
                attrs: ['cmp', 'map'], difficulty: 0.50, reward: 9, risk: 8,
                bias: bias(0.65, 0.60, 0.80), when: 'ahead',
            }),
        ], 1.1),

    ev('adc_m_spike', 'mid',
        'You are ninety seconds and one wave from your third item. Their team is already walking at the drake pit.',
        [
            opt('wait', 'Farm the wave and show up with the item', {
                attrs: ['lne', 'knw'], difficulty: 0.32, reward: 7, risk: 6,
                bias: bias(0.35, 0.40, 0.30),
            }),
            opt('now', 'Go now and fight it a man up without the item', {
                attrs: ['tmf', 'cmp'], difficulty: 0.58, reward: 10, risk: 10,
                bias: bias(0.75, 0.70, 0.95),
            }),
            opt('stall', 'Tell them to stall it until you are there', {
                attrs: ['ldr', 'map'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.45, 0.40, 0.90), when: 'even',
            }),
            opt('raptors', 'Take their raptors on the way and arrive with it anyway', {
                attrs: ['map', 'mec'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.65, 0.90, 0.70), when: 'ahead',
            }),
        ]),

    ev('adc_m_bot', 'mid',
        'Your team starts Baron without you and the bot wave is crashing into their second turret.',
        [
            opt('join', 'Abandon the wave and get to the pit', {
                attrs: ['tmf', 'map'], difficulty: 0.40, reward: 9, risk: 7,
                bias: bias(0.40, 0.35, 0.95),
            }),
            opt('turret', 'Take the turret and trust them to finish it', {
                attrs: ['lne', 'cmp'], difficulty: 0.62, reward: 12, risk: 11,
                bias: bias(0.65, 0.85, 0.20), when: 'ahead',
            }),
            opt('vision', 'Clear their bot side vision so nobody collapses on the pit', {
                attrs: ['map', 'knw'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.40, 0.45, 0.85),
            }),
        ]),

    ev('adc_m_follow', 'mid',
        'Your jungler flanks through their blue side without a ping and the fight starts three seconds later.',
        [
            opt('follow', 'Follow the flank and take it from both sides', {
                attrs: ['tmf', 'map'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.85, 0.85, 0.90), when: 'even',
            }),
            opt('front', 'Hold the front and let him live with his own call', {
                attrs: ['cmp', 'mec'], difficulty: 0.36, reward: 8, risk: 6,
                bias: bias(0.50, 0.40, 0.65),
            }),
            opt('wave', 'Ignore all of it and push the wave into their turret', {
                attrs: ['lne', 'map'], difficulty: 0.48, reward: 9, risk: 8,
                bias: bias(0.40, 0.60, 0.15), when: 'behind',
            }),
        ], 1.1),

    ev('adc_m_dive', 'mid',
        'Four of them arrive at your bot turret with the wave and your team is halfway to their blue buff.',
        [
            opt('give', 'Give the turret up and walk out before they commit', {
                attrs: ['map', 'cmp'], difficulty: 0.30, reward: 7, risk: 5,
                bias: bias(0.15, 0.20, 0.70),
            }),
            opt('hold', 'Hold under it and make the dive cost them two', {
                attrs: ['mec', 'cmp'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(0.75, 0.90, 0.90),
            }),
            opt('trade', 'Leave and take something on the far side of the map', {
                attrs: ['map', 'knw'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.55, 0.55, 0.70), when: 'behind',
            }),
        ], 1.1),

    ev('adc_m_tilt', 'mid',
        'Your mid laner has died three times and is typing rather than playing. The next objective is a minute out.',
        [
            opt('call', 'Take the shotcalling off him and make the calls yourself', {
                attrs: ['ldr', 'cmp'], difficulty: 0.54, reward: 10, risk: 8,
                bias: bias(0.55, 0.45, 0.95),
            }),
            opt('quiet', 'Say nothing and play around the rest of the map', {
                attrs: ['cmp', 'map'], difficulty: 0.42, reward: 8, risk: 6,
                bias: bias(0.30, 0.30, 0.65),
            }),
            opt('carry', 'Ignore comms and take every resource you can reach', {
                attrs: ['lne', 'mec'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.80, 0.85, 0.10), when: 'struggling',
            }),
        ], 0.8),

    // --- late --------------------------------------------------------------,

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

    // --- late, second pass --------------------------------------------------------------
    ev('adc_l_last', 'late',
        'Both teams traded four for four and you are the last one standing with fifty seconds on every respawn timer.',
        [
            opt('baron', 'Start Baron alone and finish it before they walk out', {
                attrs: ['mec', 'knw'], difficulty: 0.74, reward: 14, risk: 13,
                bias: bias(0.80, 1.00, 0.75),
            }),
            opt('waves', 'Push three waves in and let the map do the work', {
                attrs: ['lne', 'map'], difficulty: 0.46, reward: 11, risk: 8,
                bias: bias(0.50, 0.50, 0.75),
            }),
            opt('base', 'Walk into their base and take what the timer allows', {
                attrs: ['map', 'cmp'], difficulty: 0.60, reward: 13, risk: 11,
                bias: bias(0.85, 0.85, 0.60), when: 'ahead',
            }),
        ], 1.2),

    ev('adc_l_assassin', 'late',
        'Their Zed has been missing for thirty seconds and your team wants to walk into the mid choke without vision.',
        [
            opt('refuse', 'Refuse to move until someone puts a ward in front of you', {
                attrs: ['ldr', 'map'], difficulty: 0.42, reward: 10, risk: 8,
                bias: bias(0.25, 0.25, 0.85),
            }),
            opt('sup', 'Stand on your support and give up half your range', {
                attrs: ['tmf', 'cmp'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.40, 0.45, 0.95),
            }),
            opt('bait', 'Walk in first and make him spend his ultimate on your stopwatch', {
                attrs: ['cmp', 'mec'], difficulty: 0.78, reward: 14, risk: 13,
                bias: bias(0.90, 0.95, 0.80), when: 'even',
            }),
            opt('side', 'Peel off to the side lane and let them fight without you', {
                attrs: ['lne', 'map'], difficulty: 0.64, reward: 12, risk: 12,
                bias: bias(0.55, 0.85, 0.10), when: 'behind',
            }),
        ], 1.2),

    ev('adc_l_chase', 'late',
        'You win the fight at their inhibitor and their last man walks away on ten percent health.',
        [
            opt('end', 'Ignore him and hit the inhibitor', {
                attrs: ['knw', 'cmp'], difficulty: 0.38, reward: 10, risk: 7,
                bias: bias(0.50, 0.30, 0.90),
            }),
            opt('chase', 'Chase him into the fountain and take the kill', {
                attrs: ['mec', 'map'], difficulty: 0.72, reward: 13, risk: 13,
                bias: bias(1.00, 0.95, 0.20), when: 'fed',
            }),
            opt('nexus', 'Walk past all of it and hit the nexus turrets', {
                attrs: ['map', 'cmp'], difficulty: 0.58, reward: 13, risk: 11,
                bias: bias(0.85, 0.80, 0.75),
            }),
        ], 1.1),

    ev('adc_l_nexus', 'late',
        'They are between your nexus turrets with a super minion wave and three of your team are on timers.',
        [
            opt('fountain', 'Kite into fountain range and let it do the damage', {
                attrs: ['cmp', 'map'], difficulty: 0.50, reward: 11, risk: 9,
                bias: bias(0.35, 0.40, 0.75),
            }),
            opt('dps', 'Stand still and put everything you have into the frontline', {
                attrs: ['mec', 'tmf'], difficulty: 0.76, reward: 14, risk: 14,
                bias: bias(0.90, 0.90, 0.90), when: 'struggling',
            }),
            opt('minions', 'Clear the super minions first and let the turrets hold', {
                attrs: ['lne', 'knw'], difficulty: 0.62, reward: 12, risk: 11,
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

    // --- early, second pass -------------------------------------------------------------
    ev('sup_e_hook', 'early',
        'The wave is between you and him, and the hook has to go through two casters to land.',
        [
            opt('throw', 'Thread it through the gap and take the fight off it', {
                attrs: ['mec'], difficulty: 0.66, reward: 11, risk: 10,
                bias: bias(0.90, 0.85, 0.45),
            }),
            opt('around', 'Walk around the wave first and take the clean angle', {
                attrs: ['lne', 'mec'], difficulty: 0.44, reward: 8, risk: 6,
                bias: bias(0.70, 0.50, 0.55),
            }),
            opt('auto', 'Hold it and chip him down with autos instead', {
                attrs: ['lne'], difficulty: 0.26, reward: 5, risk: 4,
                bias: bias(0.55, 0.25, 0.35),
            }),
        ], 1.2),

    ev('sup_e_lvl2loss', 'early',
        'They hit two first and their support is the one that wins that fight every time.',
        [
            opt('give', 'Give up the wave and stand behind the tower', {
                attrs: ['lne', 'cmp'], difficulty: 0.28, reward: 5, risk: 3,
                bias: bias(0.15, 0.20, 0.55),
            }),
            opt('bush', 'Sit in the bush and dare him to walk past it', {
                attrs: ['map', 'cmp'], difficulty: 0.52, reward: 9, risk: 8,
                bias: bias(0.70, 0.70, 0.55), when: 'even',
            }),
            opt('summ', 'Burn a summoner to reset the lane state now', {
                attrs: ['knw', 'tmf'], difficulty: 0.66, reward: 11, risk: 10,
                bias: bias(0.55, 0.80, 0.60),
            }),
        ]),

    ev('sup_e_follow', 'early',
        'Their support leaves lane at three minutes and does not ward on the way out.',
        [
            opt('follow', 'Follow him and shout it to mid before he arrives', {
                attrs: ['map', 'ldr'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.65, 0.55, 1.00),
            }),
            opt('cash', 'Ping it and cash the two on one he left behind', {
                attrs: ['lne', 'tmf'], difficulty: 0.34, reward: 7, risk: 5,
                bias: bias(0.80, 0.45, 0.50),
            }),
            opt('hunt', 'Track him through the jungle and go for the kill', {
                attrs: ['map', 'mec'], difficulty: 0.70, reward: 12, risk: 11,
                bias: bias(0.90, 0.90, 0.30), when: 'even',
            }),
        ], 1.2),

    ev('sup_e_ctrl', 'early',
        'You have exactly enough gold for a control ward or for the component that makes your next trade work.',
        [
            opt('pink', 'Buy the ward and drop it in the river bush', {
                attrs: ['map', 'knw'], difficulty: 0.28, reward: 6, risk: 4,
                bias: bias(0.30, 0.30, 0.90),
            }),
            opt('item', 'Buy the component and win the next two trades', {
                attrs: ['lne'], difficulty: 0.40, reward: 8, risk: 6,
                bias: bias(0.75, 0.50, 0.30),
            }),
            opt('save', 'Buy neither and sit on it for the full item next back', {
                attrs: ['knw', 'cmp'], difficulty: 0.52, reward: 9, risk: 7,
                bias: bias(0.25, 0.60, 0.35), when: 'behind',
            }),
        ], 0.8),

    ev('sup_e_back', 'early',
        'Your ADC wants to back now, on a wave that will shove into their tower and take the next three with it.',
        [
            opt('hold', 'Tell him to hold two more waves before he goes', {
                attrs: ['ldr', 'lne'], difficulty: 0.38, reward: 8, risk: 6,
                bias: bias(0.45, 0.45, 0.80),
            }),
            opt('solo', 'Let him go and hold the lane on your own', {
                attrs: ['lne', 'cmp'], difficulty: 0.30, reward: 6, risk: 5,
                bias: bias(0.30, 0.45, 0.95),
            }),
            opt('both', 'Go with him and force the reset together', {
                attrs: ['knw', 'tmf'], difficulty: 0.50, reward: 9, risk: 7,
                bias: bias(0.55, 0.55, 0.75), when: 'ahead',
            }),
        ]),

    ev('sup_e_invade', 'early',
        'It is thirty seconds in and your team wants to walk into their blue side as five.',
        [
            opt('lead', 'Lead it and take the deepest ward yourself', {
                attrs: ['ldr', 'map'], difficulty: 0.56, reward: 11, risk: 10,
                bias: bias(0.85, 0.85, 0.90), when: 'even',
            }),
            opt('river', 'Go, but stop at the river and hold the line there', {
                attrs: ['map', 'knw'], difficulty: 0.34, reward: 7, risk: 5,
                bias: bias(0.60, 0.45, 0.80),
            }),
            opt('refuse', 'Refuse and set your own buff up properly', {
                attrs: ['knw', 'cmp'], difficulty: 0.30, reward: 5, risk: 3,
                bias: bias(0.20, 0.15, 0.55),
            }),
            opt('peel', 'Peel off alone and ward their second buff while they look at you', {
                attrs: ['map', 'cmp'], difficulty: 0.68, reward: 12, risk: 11,
                bias: bias(0.65, 0.95, 0.30),
            }),
        ], 1.1),

    ev('sup_e_hold', 'early',
        'You have one ward left, their jungler is bot side, and the tri bush has been dark for a minute.',
        [
            opt('now', 'Put it in the tri now and play off it', {
                attrs: ['map'], difficulty: 0.28, reward: 5, risk: 3,
                bias: bias(0.20, 0.25, 0.80),
            }),
            opt('keep', 'Hold it and drop it the second he shows himself', {
                attrs: ['map', 'cmp'], difficulty: 0.58, reward: 11, risk: 9,
                bias: bias(0.60, 0.80, 0.60),
            }),
            opt('raptors', 'Ward their raptors and hand your jungler the counter', {
                attrs: ['map', 'tmf'], difficulty: 0.46, reward: 9, risk: 7,
                bias: bias(0.65, 0.60, 0.95), when: 'even',
            }),
        ]),

    // --- mid ---------------------------------------------------------------,

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

    // --- mid, second pass ---------------------------------------------------------------
    ev('sup_m_shield', 'mid',
        'Their assassin jumps your mid laner and the same button that saves him also starts the fight you wanted.',
        [
            opt('save', 'Spend it on him and let the fight happen anyway', {
                attrs: ['tmf', 'cmp'], difficulty: 0.38, reward: 9, risk: 7,
                bias: bias(0.50, 0.50, 1.00),
            }),
            opt('engage', 'Use it as the engage and let him eat the damage', {
                attrs: ['tmf', 'mec'], difficulty: 0.70, reward: 13, risk: 12,
                bias: bias(1.00, 0.90, 0.45),
            }),
            opt('cover', 'Hold both and reposition to cover the retreat', {
                attrs: ['cmp', 'knw'], difficulty: 0.50, reward: 10, risk: 8,
                bias: bias(0.35, 0.55, 0.70), when: 'behind',
            }),
        ], 1.2),

    ev('sup_m_drakeward', 'mid',
        'You have two wards and there is a drake in ninety seconds you are probably not going to win.',
        [
            opt('pit', 'Spend both on the approach they have to walk', {
                attrs: ['map', 'knw'], difficulty: 0.48, reward: 10, risk: 8,
                bias: bias(0.65, 0.60, 0.85), when: 'even',
            }),
            opt('own', 'Ward your own jungle so the next fight is on your terms', {
                attrs: ['map', 'cmp'], difficulty: 0.36, reward: 8, risk: 5,
                bias: bias(0.25, 0.35, 0.70),
            }),
            opt('inside', 'Set the pit itself and accept you might not walk out', {
                attrs: ['cmp', 'tmf'], difficulty: 0.68, reward: 12, risk: 11,
                bias: bias(0.70, 0.95, 0.75),
            }),
        ], 1.1),

    ev('sup_m_stray', 'mid',
        'You are walking back from a reset and their jungler crosses the lane in front of you with no vision behind him.',
        [
            opt('solo', 'Take the fight on your own right there', {
                attrs: ['mec', 'tmf'], difficulty: 0.72, reward: 13, risk: 12,
                bias: bias(1.00, 0.95, 0.25),
            }),
            opt('ward', 'Ward him, ping it, and keep walking', {
                attrs: ['map', 'knw'], difficulty: 0.34, reward: 7, risk: 5,
                bias: bias(0.20, 0.30, 0.55),
            }),
            opt('hold', 'Slow him down and hold him there for the collapse', {
                attrs: ['tmf', 'ldr'], difficulty: 0.56, reward: 11, risk: 9,
                bias: bias(0.85, 0.70, 1.00), when: 'ahead',
            }),
        ]),

    ev('sup_m_alone', 'mid',
        'Your ADC wants the side wave and the only ward that covers him has to be placed from inside their jungle.',
        [
            opt('go', 'Go and place it, and let him keep farming', {
                attrs: ['map', 'cmp'], difficulty: 0.54, reward: 11, risk: 9,
                bias: bias(0.55, 0.75, 0.80),
            }),
            opt('stay', 'Stand with him and play the side lane blind', {
                attrs: ['lne', 'cmp'], difficulty: 0.36, reward: 8, risk: 5,
                bias: bias(0.30, 0.35, 0.85),
            }),
            opt('group', 'Pull him off the wave and group with the other three', {
                attrs: ['ldr', 'knw'], difficulty: 0.42, reward: 9, risk: 7,
                bias: bias(0.45, 0.40, 0.95), when: 'behind',
            }),
        ]),

    ev('sup_m_nobody', 'mid',
        'You can see the fight and nobody else on the call wants it. Two of them are still arguing about the last one.',
        [
            opt('call', 'Make the call and walk in first anyway', {
                attrs: ['ldr', 'tmf'], difficulty: 0.66, reward: 13, risk: 12,
                bias: bias(0.95, 0.90, 0.85), when: 'struggling',
            }),
            opt('drop', 'Take the fight off the table and reset the comms', {
                attrs: ['ldr', 'cmp'], difficulty: 0.38, reward: 9, risk: 6,
                bias: bias(0.25, 0.25, 0.90),
            }),
            opt('quiet', 'Say nothing and walk the vision in for it regardless', {
                attrs: ['map', 'knw'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.50, 0.45, 0.50),
            }),
        ], 1.1),

    ev('sup_m_item', 'mid',
        'Their comp has one thing that kills your carry and you have gold for exactly one item that answers it.',
        [
            opt('cleanse', 'Buy the cleanse item and hold it for him all game', {
                attrs: ['knw', 'cmp'], difficulty: 0.36, reward: 8, risk: 6,
                bias: bias(0.25, 0.35, 1.00),
            }),
            opt('engage', 'Buy the engage item and make it their problem instead', {
                attrs: ['knw', 'tmf'], difficulty: 0.60, reward: 12, risk: 10,
                bias: bias(0.90, 0.75, 0.55), when: 'ahead',
            }),
            opt('wards', 'Buy neither and load up on wards and a sweeper', {
                attrs: ['map', 'knw'], difficulty: 0.38, reward: 8, risk: 5,
                bias: bias(0.25, 0.25, 0.60),
            }),
        ], 0.8),

    ev('sup_m_tilt', 'mid',
        'Your jungler has died twice to the same play and is now telling mid whose fault the game is.',
        [
            opt('lead', 'Shut it down and give everyone one thing to do', {
                attrs: ['ldr'], difficulty: 0.40, reward: 9, risk: 6,
                bias: bias(0.30, 0.30, 1.00),
            }),
            opt('agree', 'Agree with him for now and pick the argument up later', {
                attrs: ['ldr', 'cmp'], difficulty: 0.52, reward: 10, risk: 8,
                bias: bias(0.55, 0.55, 0.40),
            }),
            opt('ignore', 'Ignore all of it and go win the vision war on your own', {
                attrs: ['map', 'cmp'], difficulty: 0.62, reward: 11, risk: 10,
                bias: bias(0.55, 0.80, 0.15),
            }),
            opt('mute', 'Mute the lot of them and play the next fight off pings', {
                attrs: ['cmp', 'knw'], difficulty: 0.34, reward: 8, risk: 6,
                bias: bias(0.40, 0.45, 0.25), when: 'struggling',
            }),
        ], 0.9),

    // --- late --------------------------------------------------------------,

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

    // --- late, second pass --------------------------------------------------------------
    ev('sup_l_check', 'late',
        'Nobody knows where three of them are and somebody has to walk into the mid bush before the team commits to Baron.',
        [
            opt('face', 'Walk in yourself and take whatever is standing in there', {
                attrs: ['cmp', 'tmf'], difficulty: 0.50, reward: 11, risk: 10,
                bias: bias(0.85, 0.85, 1.00),
            }),
            opt('ward', 'Throw the last ward at it from maximum range', {
                attrs: ['map', 'knw'], difficulty: 0.40, reward: 9, risk: 7,
                bias: bias(0.35, 0.35, 0.70),
            }),
            opt('off', 'Refuse to check it and back the Baron off entirely', {
                attrs: ['knw', 'ldr'], difficulty: 0.44, reward: 9, risk: 7,
                bias: bias(0.15, 0.20, 0.75), when: 'ahead',
            }),
            opt('tank', 'Send the tank in and hold your engage behind him', {
                attrs: ['ldr', 'tmf'], difficulty: 0.66, reward: 12, risk: 11,
                bias: bias(0.70, 0.70, 0.55),
            }),
        ], 1.2),

    ev('sup_l_both', 'late',
        'The fight starts and the engage and the peel are both the right answer. You get one of them.',
        [
            opt('engage', 'Engage and trust the carry to walk in behind you', {
                attrs: ['tmf', 'mec'], difficulty: 0.72, reward: 14, risk: 13,
                bias: bias(1.00, 0.90, 0.65),
            }),
            opt('peel', 'Peel and let the fight come onto your carry', {
                attrs: ['tmf', 'cmp'], difficulty: 0.46, reward: 11, risk: 9,
                bias: bias(0.40, 0.40, 1.00),
            }),
            opt('read', 'Hold both and read the first two seconds before spending anything', {
                attrs: ['knw', 'cmp'], difficulty: 0.78, reward: 14, risk: 13,
                bias: bias(0.60, 0.90, 0.65), when: 'even',
            }),
        ], 1.3),

    ev('sup_l_lost', 'late',
        'Your top laner is already dead in every way except the animation, and the shield in your hand was meant for the carry.',
        [
            opt('spend', 'Spend it on him and buy the team four more seconds', {
                attrs: ['tmf', 'cmp'], difficulty: 0.58, reward: 12, risk: 11,
                bias: bias(0.70, 0.75, 1.00), when: 'struggling',
            }),
            opt('keep', 'Let him go and keep it for the carry', {
                attrs: ['knw', 'cmp'], difficulty: 0.42, reward: 10, risk: 8,
                bias: bias(0.35, 0.35, 0.45),
            }),
            opt('trade', 'Walk in after him and turn it into a trade', {
                attrs: ['mec', 'tmf'], difficulty: 0.74, reward: 14, risk: 13,
                bias: bias(1.00, 0.95, 0.50),
            }),
        ], 1.1),

    ev('sup_l_stall', 'late',
        'They have Baron, you have four minutes of buff to survive, and your team wants to contest the next drake anyway.',
        [
            opt('base', 'Hold the base and give up everything outside it', {
                attrs: ['cmp', 'knw'], difficulty: 0.48, reward: 10, risk: 8,
                bias: bias(0.15, 0.25, 0.75),
            }),
            opt('drake', 'Fight for the drake vision while the buff is still ticking', {
                attrs: ['map', 'tmf'], difficulty: 0.68, reward: 13, risk: 12,
                bias: bias(0.85, 0.90, 0.70), when: 'behind',
            }),
            opt('side', 'Hold one side lane with the carry and let the rest defend', {
                attrs: ['map', 'cmp'], difficulty: 0.56, reward: 11, risk: 10,
                bias: bias(0.55, 0.55, 0.55),
            }),
        ]),
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
