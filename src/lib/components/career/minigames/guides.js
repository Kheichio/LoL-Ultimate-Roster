// ===========================================================================
//  The briefing for every training drill, in plain words.
//
//  MinigameHost shows one of these before a drill starts, so every drill is
//  explained the same way: what you are trying to do, three steps, the
//  controls, and what a normal score looks like. The Training screen reads
//  `goal` for its "You play:" line, so the two can never describe a drill
//  differently.
//
//  Keyed by the game id in constants.ATTRS[].game. Keep each step to one idea
//  and one line; the long-form rules still live in each game's own result and
//  feedback copy.
// ===========================================================================

/** Every drill is tuned so a competent session scores 50%, which pays exactly
 *  the normal gain (training.scoreFactor's 1.0x reference). */
export const SCORE_NOTE = 'A score of 50% earns the normal gain for this drill. Every point above that earns more, every point below it less.';

export const MINIGAME_GUIDES = {
    combo: {
        icon: 'target',
        goal: 'hit each target the moment its shrinking ring touches it',
        steps: [
            'A circle appears with a ring around it, and the ring shrinks.',
            'Hit the circle exactly when the ring touches its edge. Too early or too late is a miss.',
            'Hits in a row build your combo, which is a quarter of your score.',
        ],
        controls: [['Click', 'the target'], ['Space / Z / X', 'hits the target closest to its beat']],
    },
    wave: {
        icon: 'waves',
        goal: 'grow a minion wave, then crash it into their tower at the right time',
        steps: [
            'Each wave walks up the lane. Act when it reaches the amber band.',
            'HOLD keeps it: the next wave joins and your push gets bigger (five at most).',
            'CRASH sends the whole push into their tower and banks it. Bigger pushes pay more, but crash before the lane runs out.',
        ],
        controls: [['H', 'Hold'], ['Space', 'Crash'], ['Timing', 'press while the wave is in the amber band']],
    },
    ward: {
        icon: 'map',
        goal: 'glance at the map, remember where everyone was, then answer',
        steps: [
            'Enemies (red circles) and your team (blue squares) flash on the map for a moment.',
            'They disappear and a question asks where someone was, how many there were, or who was missing.',
            'Answer in your own time: only the flash is timed. Closer answers score more.',
        ],
        controls: [['Click', 'the map for "where" questions'], ['1 - 5', 'multiple choice'], ['Arrows + Enter', 'aim without a mouse']],
    },
    focus: {
        icon: 'swords',
        goal: 'pick the best target in each frozen teamfight, or get out',
        steps: [
            'Look for an enemy who is low on health and dangerous. That is usually the best target.',
            'Untargetable or out-of-range enemies are worth nothing; shields and heals make a target worse.',
            'If you are about to die and can escape, Disengage is the right answer.',
        ],
        controls: [['1 - 5', 'pick a target'], ['0 or D', 'disengage'], ['Speed', 'the score shrinks as the timer runs down']],
    },
    clutch: {
        icon: 'snow',
        goal: 'stop the moving marker inside the zone, even when everything changes',
        steps: [
            'A marker sweeps across a bar. Stop it inside the zone; nearer the centre scores more.',
            'Every hit shrinks the zone. An amber warning means a change is coming in half a second.',
            'Three misses tilt you and the next reps count double, so stay calm and take the shot.',
        ],
        controls: [['Space / Enter', 'stop the marker'], ['Tap', 'STOP or the bar on a phone']],
    },
    shotcall: {
        icon: 'chat',
        goal: 'read the game state and make the right call before time runs out',
        steps: [
            'Read the situation: gold, objective timers, who is dead, where the waves are.',
            'Pick one of four calls. One is best and one is nearly as good.',
            'Always answer: running out of time scores zero, and a guess does not.',
        ],
        controls: [['1 - 4', 'or click a call'], ['Space', 'skip the explanation']],
    },
    pool: {
        icon: 'cards',
        goal: 'solve each draft problem: counters, team gaps and bans',
        steps: [
            'Read the draft question and the picks already made.',
            'Choose one of four answers. One is clearly right, one is worth half.',
            'Every pick has a clock and the whole session shares a time bank, so do not hesitate.',
        ],
        controls: [['1 - 4', 'or click a card']],
    },
    knowledge: {
        icon: 'guide',
        goal: 'answer quick League knowledge questions: timers, items and rules',
        steps: [
            'Every question has four answers and exactly one is right.',
            'Answer before the timer ends. A question you do not reach counts as wrong.',
            'Right answers in a row build a streak bonus, and every answer is explained.',
        ],
        controls: [['1 - 4', 'or click an answer'], ['Space', 'move on early']],
    },
};

export function guideFor(gameId) {
    return MINIGAME_GUIDES[gameId] || null;
}
