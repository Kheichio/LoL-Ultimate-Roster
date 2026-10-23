// Exact odds for the roster game's round resolution, shared by every mode's match screen.
//
// Every mode resolves a round the same way (Tournament, Season, Tower and Draft each have a
// copy of pickPlay that does this):
//   you  = yourPower + (yourStat[yourPlay] - theirStat[theirPlay]) + rollA
//   them = theirPower + rollB
//   rollA, rollB uniform integers in [-5, 5]; the CPU's play is uniform over ALL plays;
//   you win the round on a tie.
// So the screen can show a real probability instead of the old opaque "Net +3". If a mode's
// pickPlay ever changes that formula, this file has to change with it.

// d = rollA - rollB runs -10..10 with a triangular distribution: P(d = k) = (11 - |k|) / 121.
const D_TAIL = (() => {
    const tail = {};
    for (let x = -11; x <= 11; x++) {
        let p = 0;
        for (let k = -10; k <= 10; k++) if (k >= x) p += (11 - Math.abs(k)) / 121;
        tail[x] = p;
    }
    return tail;
})();
function pAtLeast(x) {
    if (x <= -10) return 1;
    if (x > 10) return 0;
    return D_TAIL[x];
}

/** Chance of winning one round with a play whose stat is `myStat`. */
export function roundWinChance(myPower, cpuPower, myStat, cpuStatPool) {
    if (!cpuStatPool || cpuStatPool.length === 0) return 0.5;
    let p = 0;
    for (const cs of cpuStatPool) p += pAtLeast(Math.ceil(cpuPower - myPower - myStat + cs));
    return p / cpuStatPool.length;
}

// Chance of taking a race to `need` wins from (a more needed, b more needed for them),
// with every remaining round won at probability p.
function race(p, a, b, memo = new Map()) {
    if (a <= 0) return 1;
    if (b <= 0) return 0;
    const key = a * 100 + b;
    if (memo.has(key)) return memo.get(key);
    const v = p * race(p, a - 1, b, memo) + (1 - p) * race(p, a, b - 1, memo);
    memo.set(key, v);
    return v;
}

/**
 * Series win probability. Every round the screen offers 3 of the plays at random and the
 * player is assumed to take the best one, so a future round is worth the best-of-3 chance
 * averaged over every possible offer. The current round uses the offer actually on screen.
 */
export function seriesWinChance({ myPower, cpuPower, myStats, cpuStatPool, allStats, offered, scoreBlue, scoreRed, winsNeeded }) {
    const chanceFor = (stat) => roundWinChance(myPower, cpuPower, myStats[stat] || 0, cpuStatPool);
    const chances = allStats.map(chanceFor);
    // Expected best of a random 3-of-n offer.
    let sum = 0, n = 0;
    for (let i = 0; i < chances.length; i++)
        for (let j = i + 1; j < chances.length; j++)
            for (let k = j + 1; k < chances.length; k++) { sum += Math.max(chances[i], chances[j], chances[k]); n++; }
    const pFuture = n ? sum / n : (chances[0] || 0.5);
    const a = winsNeeded - scoreBlue, b = winsNeeded - scoreRed;
    if (a <= 0) return 1;
    if (b <= 0) return 0;
    if (!offered || offered.length === 0) return race(pFuture, a, b);
    const pNow = Math.max(...offered.map(p => chanceFor(p.stat)));
    return pNow * race(pFuture, a - 1, b) + (1 - pNow) * race(pFuture, a, b - 1);
}

/**
 * The plays offered in a game: `n` drawn uniformly at random. Every mode used to do this
 * with `[...PLAYS].sort(() => Math.random() - 0.5).slice(0, 3)`, which is NOT a uniform
 * shuffle — measured over 200k draws it offered Teamfight 69% of the time and Composure
 * only 50%, where a fair draw gives each play 60%. That skewed every match in the game
 * towards whichever stats the sort happened to favour, and it made seriesWinChance (which
 * assumes a fair offer) read about two points off. Fisher–Yates is uniform.
 */
export function drawPlays(plays, n = 3) {
    const out = [...plays];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, n);
}

// How each stat reads on screen. Keyed by stat, not by play id, because Draft names its
// plays differently ("Skirmish" is MEC) but every mode resolves on the same five stats.
export const STAT_META = {
    mec: { short: 'MEC', name: 'Mechanics',  icon: 'bolt',  c: '#38bdf8', blurb: 'Out-play them in lane on raw hands' },
    tmf: { short: 'TMF', name: 'Teamfight',  icon: 'flame', c: '#fb923c', blurb: 'Force the five-versus-five at the next objective' },
    map: { short: 'MAP', name: 'Macro',      icon: 'map',   c: '#34d399', blurb: 'Out-rotate them and choke the map' },
    frm: { short: 'FRM', name: 'Form',       icon: 'trend', c: '#c084fc', blurb: 'Ride your momentum and hit every timing' },
    cmp: { short: 'CMP', name: 'Composure',  icon: 'snow',  c: '#22d3ee', blurb: 'Stay calm and close out the late game' },
};
export const STAT_ORDER = ['mec', 'tmf', 'map', 'frm', 'cmp'];
