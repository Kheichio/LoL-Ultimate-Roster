<script>
    // ===================================================================
    //  DRAFT ROOM  -  Champion Pool (CHP) training drill
    //  Accent #14b8a6. Self-contained: the ONLY import is the read-only
    //  champion vocabulary so the drill talks about the same champions as
    //  the rest of career mode.
    // ===================================================================
    import { onMount, onDestroy } from 'svelte';
    import { CHAMPION_BY_ID } from '../../../career/constants.js';

    export let difficulty = 1;
    export let drill = null;
    export let onComplete = null;
    export let onQuit = null;

    // ---------- tuning ----------------------------------------------------
    // `read` seconds show the board and the question with NO options and no
    // clock running - neither the per-puzzle cap nor the shared bank ticks
    // during it. The bank is therefore pure thinking time, which is the whole
    // point: reading a draft board is not the skill being measured. The read
    // phase is skippable with Space or the Show Options button.
    //
    // The BANK was the real crunch, not the cap. Thirty-eight seconds spread
    // across twelve boards is a little over three seconds a board on average -
    // the per-puzzle cap of eight was never reachable more than a couple of
    // times before the bank ran dry and started auto-failing boards the player
    // had not even been shown yet. The bank is now roughly double, and the cap
    // is wide enough to actually spend it on a hard board.
    //
    // `par` is what keeps the score honest. The decisiveness weight below used
    // to be measured against `cap`, so widening the cap would have paid
    // everyone more for an identical pick. It is measured against par - which
    // holds the OLD caps - so a four-second read is worth exactly what it was
    // worth before, and the extra seconds buy an answer rather than a bonus.
    const DIFFS = {
        1: { picks: 10, read: 5.5, bank: 85, cap: 18.0, par: 11.0, name: 'Basic Drill', blurb: 'Ten boards and eighty-five seconds of thinking to spend on them.' },
        2: { picks: 11, read: 4.8, bank: 80, cap: 16.0, par: 9.5,  name: 'Advanced',    blurb: 'Eleven boards, a tighter bank, scouting noise.' },
        3: { picks: 12, read: 4.2, bank: 72, cap: 14.0, par: 8.0,  name: 'Elite',       blurb: 'Twelve boards, seventy-two seconds, pro-level drafts.' },
    };
    const REVEAL_MS = 900;

    $: dLevel = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 1)));
    $: cfg = DIFFS[dLevel];

    // ---------- champion vocabulary ---------------------------------------
    function K(id) {
        const c = CHAMPION_BY_ID[id];
        return c ? { name: c.name, arch: c.archetype } : { name: id, arch: 'Champion' };
    }
    function E(name, arch) { return { name: name, arch: arch }; }
    function o(chip, credit) { return { name: chip.name, arch: chip.arch, credit: credit }; }

    // Shared "what does the fifth pick provide" vocabulary.
    const FRONT  = E('Frontline',   'Somebody to take the hit');
    const ENGAGE = E('Hard Engage', 'A button that starts it');
    const DISENG = E('Disengage',   'A button that undoes it');
    const APDMG  = E('AP Damage',   'Magic on the damage chart');
    const PEEL   = E('Peel',        'Keep the carry breathing');
    const CLEAR  = E('Wave Clear',  'Hold the side lanes');

    // ---------- puzzle bank: COUNTER PICK ---------------------------------
    const COUNTERS = [
        {
            type: 'counter', tag: 'Counter Pick', tier: 1, lane: 'TOP',
            ctxLabel: 'Enemy locked', ctx: [K('darius')],
            prompt: 'They locked Darius into your top lane. Blind pick is over - what do you take?',
            opts: [o(K('gnar'), 1), o(K('fiora'), 0.5), o(K('sett'), 0), o(K('yasuo'), 0)],
            why: 'Darius has no gap closer past his E, so you answer him with range - Gnar kites the whole cooldown and never hands over a stack of bleed.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 1, lane: 'MID',
            ctxLabel: 'Enemy locked', ctx: [K('yasuo')],
            prompt: 'Yasuo is locked mid and you have last pick. What answers him?',
            opts: [o(E('Annie', 'Burst Mage'), 1), o(K('ahri'), 0.5), o(K('corki'), 0), o(K('zed'), 0)],
            why: 'Windwall eats every projectile in that lane, so the counter is point-and-click - Annie stuns him through the wall and one-shots him at six.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 1, lane: 'TOP',
            ctxLabel: 'Enemy locked', ctx: [K('fiora')],
            prompt: 'Fiora is on the board and your top lane is open. Who do you trust into her?',
            opts: [o(K('malphite'), 1), o(K('gnar'), 0.5), o(K('jax'), 0), o(K('riven'), 0)],
            why: 'Fiora needs a target she can duel - Malphite stacks armour, shields off her vitals, and turns a lost lane into a game-winning ultimate.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 1, lane: 'JNG',
            ctxLabel: 'Enemy locked', ctx: [E('Master Yi', 'Skirmisher')],
            prompt: 'Their jungle is Master Yi and you are picking last. What do you take?',
            opts: [o(E('Rammus', 'Warden'), 1), o(K('jarvan'), 0.5), o(K('graves'), 0), o(K('kindred'), 0)],
            why: 'Yi is nothing but auto-attacks and an untargetable dash - Rammus punishes both, and one taunt turns his ultimate into a free kill for your team.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 2, lane: 'SUP',
            ctxLabel: 'Enemy locked', ctx: [E('Blitzcrank', 'Catcher')],
            prompt: 'Blitzcrank support, and your ADC is an immobile hypercarry. Who do you pick?',
            opts: [o(K('braum'), 1), o(K('milio'), 0.5), o(K('pyke'), 0), o(E('Zyra', 'Battlemage'), 0)],
            why: "One hook decides that lane, so you take the champion who deletes it - Braum's Unbreakable destroys the first projectile for the whole team.",
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 2, lane: 'ADC',
            ctxLabel: 'Enemy locked', ctx: [K('kaisa')],
            prompt: 'They locked their marksman into your last pick bot lane. What do you take?',
            opts: [o(K('caitlyn'), 1), o(K('ezreal'), 0.5), o(K('jinx'), 0), o(E("Kog'Maw", 'Hypercarry'), 0)],
            why: 'That pick is weakest before its first item, so you take the longest range in the game - Caitlyn wins every trade she is allowed to take before the spike.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 3, lane: 'MID',
            ctxLabel: 'Enemy locked', ctx: [K('zed')],
            prompt: 'Zed is locked mid. Your mid laner needs to survive the 6-to-11 window.',
            opts: [o(E('Lissandra', 'Mage'), 1), o(K('syndra'), 0.5), o(K('azir'), 0), o(K('viktor'), 0)],
            why: 'Zed only beats champions he can burst - Lissandra self-stasis on his ultimate and then point-and-click ults him back with no skillshot to dodge.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 3, lane: 'TOP',
            ctxLabel: 'Enemy locked', ctx: [K('ornn')],
            prompt: 'Ornn is locked top and your team needs lane priority on that side.',
            opts: [o(K('renekton'), 1), o(K('darius'), 0.5), o(K('ksante'), 0), o(K('malphite'), 0)],
            why: 'Ornn is the weakest level 1-to-6 top in the game, so you punish him with an early-spike bully - Renekton takes the wave, the plates and his tempo.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 3, lane: 'ADC',
            ctxLabel: 'Enemy locked', ctx: [K('draven')],
            prompt: 'Draven bot, and your bot lane cannot afford to lose another lane. Pick.',
            opts: [o(K('ezreal'), 1), o(K('varus'), 0.5), o(K('kaisa'), 0), o(K('jinx'), 0)],
            why: 'Draven only converts a lead if he gets kills - Ezreal farms from outside axe range and turns the lane into a game Draven cannot win by default.',
        },
        {
            type: 'counter', tag: 'Counter Pick', tier: 3, lane: 'MID',
            ctxLabel: 'Enemy locked', ctx: [E('Kassadin', 'Assassin')],
            prompt: 'Kassadin mid, and you have the last pick of the draft.',
            opts: [o(E('Pantheon', 'Diver'), 1), o(K('syndra'), 0.5), o(K('ahri'), 0), o(E('Kayle', 'Marksman'), 0)],
            why: 'Kassadin is unbeatable at three items, so the counter is a champion who ends the game first - Pantheon deletes him pre-6 and his ultimate spreads that lead across the map.',
        },
    ];

    // ---------- puzzle bank: COMP HOLE boards ------------------------------
    // Each board becomes two consecutive puzzles: name the hole, then fill it.
    const BOARDS = [
        {
            tier: 1, need: 'peel', slot: 'SUPPORT',
            team: [K('ornn'), K('sejuani'), K('orianna'), K('jinx')],
            note: 'Their comp: Camille, Vi, LeBlanc - three champions whose whole job is reaching your marksman.',
            needOpts: [o(PEEL, 1), o(DISENG, 0.5), o(FRONT, 0), o(APDMG, 0)],
            fillOpts: [o(K('lulu'), 1), o(K('milio'), 0.5), o(K('leona'), 0), o(K('pyke'), 0)],
            whyNeed: 'Two tanks already start the fight and the AP is covered - the only thing missing is somebody keeping the immobile marksman alive through the dive.',
            whyFill: 'Lulu is the pick that survives a committed dive: shield, slow, polymorph and an ultimate that buys the four seconds the comp is built around.',
        },
        {
            tier: 1, need: 'frontline', slot: 'SUPPORT',
            team: [K('camille'), K('leesin'), K('leblanc'), K('kaisa')],
            note: 'Four divers, zero health bars. Somebody has to be standing in the middle of the fight.',
            needOpts: [o(FRONT, 1), o(ENGAGE, 0.5), o(CLEAR, 0), o(APDMG, 0)],
            fillOpts: [o(K('nautilus'), 1), o(K('braum'), 0.5), o(K('bard'), 0), o(K('karma'), 0)],
            whyNeed: 'Every one of those four picks wants to jump in second. Without a body in front, the first crowd control the enemy lands ends the fight.',
            whyFill: 'Nautilus survives the front of a fight and lands his crowd control without needing a skillshot chain first - the exact thing four divers cannot do for themselves.',
        },
        {
            tier: 2, need: 'AP damage', slot: 'MID',
            team: [K('renekton'), K('xinzhao'), K('caitlyn'), K('thresh')],
            note: 'Their top laner has first-picked a tank and their support is a warden.',
            needOpts: [o(APDMG, 1), o(FRONT, 0.5), o(CLEAR, 0), o(DISENG, 0)],
            fillOpts: [o(K('syndra'), 1), o(K('viktor'), 0.5), o(K('zed'), 0), o(K('yasuo'), 0)],
            whyNeed: "Every point of that damage is physical - one Randuin's and a Frozen Heart and the comp simply stops working.",
            whyFill: 'Syndra brings the magic damage and the point-and-click ultimate the board is missing; Viktor gets there too, but not until three items.',
        },
        {
            tier: 2, need: 'disengage', slot: 'SUPPORT',
            team: [E('Jayce', 'Poke'), K('nidalee'), K('corki'), K('varus')],
            note: 'Their draft is Malphite, Sejuani and Leona. They have one plan and it is running at you.',
            needOpts: [o(DISENG, 1), o(PEEL, 0.5), o(ENGAGE, 0), o(FRONT, 0)],
            fillOpts: [o(E('Janna', 'Enchanter'), 1), o(K('braum'), 0.5), o(K('leona'), 0), o(K('nautilus'), 0)],
            whyNeed: 'A poke comp loses to exactly one thing - being engaged on - so the last pick has to be the button that undoes their all-in.',
            whyFill: "Janna's ultimate resets the fight from zero and her Q stops the engage before it lands; Braum only blocks one of the three tools they have.",
        },
        {
            tier: 3, need: 'hard engage', slot: 'SUPPORT',
            team: [E('Kayle', 'Marksman'), K('graves'), K('viktor'), K('ezreal')],
            note: "Their comp is Ornn, Orianna and Kog'Maw. They will happily farm until 35 minutes.",
            needOpts: [o(ENGAGE, 1), o(PEEL, 0.5), o(APDMG, 0), o(CLEAR, 0)],
            fillOpts: [o(K('nautilus'), 1), o(K('rakan'), 0.5), o(K('lulu'), 0), o(K('karma'), 0)],
            whyNeed: 'Nobody on that board can force a fight, and the enemy scales harder - if you cannot start it on your terms you never get to play.',
            whyFill: 'Nautilus is the most reliable engage in the game: an unmissable ultimate onto their carry, which is the one opening this comp needs.',
        },
        {
            tier: 3, need: 'peel', slot: 'SUPPORT',
            team: [K('malphite'), K('vi'), K('ahri'), E("Kog'Maw", 'Hypercarry')],
            note: 'Their jungle is Nocturne and their mid is Zed. Both of them are going to be standing next to your marksman.',
            needOpts: [o(PEEL, 1), o(DISENG, 0.5), o(ENGAGE, 0), o(FRONT, 0)],
            fillOpts: [o(K('lulu'), 1), o(K('milio'), 0.5), o(K('thresh'), 0), o(K('leona'), 0)],
            whyNeed: 'The marksman is the entire win condition and he cannot move - three engage tools are already on the board, so the fifth pick keeps him alive.',
            whyFill: "Lulu's ultimate is the difference between that marksman living four seconds and living twelve, and the range buff doubles his damage window.",
        },
    ];

    // ---------- puzzle bank: BAN PHASE -------------------------------------
    const BANS = [
        {
            type: 'ban', tag: 'Ban Phase', tier: 1,
            ctxLabel: 'Their three best picks', ctx: [K('malphite'), K('ornn'), K('sejuani')],
            prompt: 'You have already locked Yasuo and Draven, with no cleanse and no disengage. What do you ban?',
            opts: [o(K('malphite'), 1), o(K('sejuani'), 0.5), o(K('ornn'), 0), o(K('ahri'), 0)],
            why: 'Both of your carries die to one unmissable ultimate - Malphite is the only ban that removes a button which beats your comp on its own.',
        },
        {
            type: 'ban', tag: 'Ban Phase', tier: 2,
            ctxLabel: 'Their three best picks', ctx: [K('thresh'), K('nautilus'), K('rakan')],
            prompt: 'Your bot lane is an immobile hypercarry plus an enchanter, and you have to survive laning. Ban.',
            opts: [o(K('nautilus'), 1), o(K('thresh'), 0.5), o(K('rakan'), 0), o(E('Zyra', 'Battlemage'), 0)],
            why: 'Your carry dies to any lockdown he cannot flash - Nautilus is the only one of the three whose crowd control does not have to be dodged first.',
        },
        {
            type: 'ban', tag: 'Ban Phase', tier: 2,
            ctxLabel: 'Their mid pool', ctx: [E('LeBlanc', 'Assassin'), K('ahri'), K('syndra')],
            prompt: 'Their mid has 40 games on LeBlanc this split and two on the rest. Your mid is an immobile control mage.',
            opts: [o(E('LeBlanc', 'Assassin'), 1), o(K('syndra'), 0.5), o(K('ahri'), 0), o(K('zed'), 0)],
            why: 'You ban the champion the player is actually best on - forty games of LeBlanc is a far bigger threat to an immobile mid than a comfort Ahri.',
        },
        {
            type: 'ban', tag: 'Ban Phase', tier: 3,
            ctxLabel: 'Their three best picks', ctx: [K('ksante'), K('ornn'), E('Sion', 'Juggernaut')],
            prompt: 'Your comp has four sources of physical damage and no percent-health damage anywhere. Ban.',
            opts: [o(K('ksante'), 1), o(K('ornn'), 0.5), o(E('Sion', 'Juggernaut'), 0), o(K('maokai'), 0)],
            why: "A pure physical comp loses to the tank it cannot kill - K'Sante turns your only damage type off during the ultimate and walks out with your carry.",
        },
        {
            type: 'ban', tag: 'Ban Phase', tier: 3,
            ctxLabel: 'Their three best picks', ctx: [K('azir'), K('orianna'), K('viktor')],
            prompt: 'You are on a dive comp that has to close the game before 25 minutes. Ban.',
            opts: [o(K('azir'), 1), o(K('orianna'), 0.5), o(K('viktor'), 0), o(K('corki'), 0)],
            why: 'Azir and Orianna both undo a dive with one button, but the wall throws your whole engage back out of the fight - and it happens from further away.',
        },
        {
            type: 'ban', tag: 'Ban Phase', tier: 3,
            ctxLabel: 'Their three best picks', ctx: [K('camille'), K('fiora'), K('jax')],
            prompt: 'Your top laner is a weakside tank and your plan is to group as five at 20 minutes. Ban.',
            opts: [o(K('camille'), 1), o(K('fiora'), 0.5), o(K('jax'), 0), o(K('gwen'), 0)],
            why: 'Camille is the only one of the three who splits your map apart and still arrives at the teamfight with an ultimate that removes your carry.',
        },
    ];

    // ---------- puzzle bank: FLEX READ -------------------------------------
    function flex(tier, chip, right, half, bad1, bad2, why) {
        return {
            type: 'flex', tag: 'Flex Read', tier: tier,
            ctxLabel: 'On the board', ctx: [chip],
            prompt: 'Draft is flexing. Which two roles can this champion actually be played in?',
            opts: [
                { name: right, arch: 'Role pair', credit: 1 },
                { name: half, arch: 'Role pair', credit: 0.5 },
                { name: bad1, arch: 'Role pair', credit: 0 },
                { name: bad2, arch: 'Role pair', credit: 0 },
            ],
            why: why,
        };
    }
    const FLEXES = [
        flex(1, K('sylas'), 'MID / TOP', 'MID / JNG', 'SUP / ADC', 'TOP / JNG',
            'Sylas is a mid laner first, and his sustain and wave clear let him hold top lane whenever the draft wants to hide the matchup.'),
        flex(1, K('karma'), 'SUP / MID', 'SUP / TOP', 'MID / JNG', 'ADC / JNG',
            'Karma is a support who has always doubled as a mid laner - the shield-and-poke pattern works in either lane with no item change.'),
        flex(1, K('ashe'), 'ADC / SUP', 'ADC / MID', 'SUP / JNG', 'ADC / TOP',
            'Ashe flexes bot: as the marksman she scales, as the support she keeps the hawk and the ultimate and gives up only the farm.'),
        flex(2, K('pyke'), 'SUP / MID', 'SUP / JNG', 'TOP / MID', 'ADC / SUP',
            'Pyke is drafted as a support and revealed as a mid - same roams, same execute, and the gold share stops being a limitation.'),
        flex(2, K('rumble'), 'TOP / MID', 'TOP / JNG', 'MID / SUP', 'TOP / ADC',
            'Rumble is the classic top-mid flex: the same equalizer wins a side lane or a mid lane, so the enemy cannot counter-pick either one.'),
        flex(2, K('wukong'), 'JNG / TOP', 'JNG / MID', 'TOP / SUP', 'MID / ADC',
            'Wukong is picked early precisely because he is a jungler and a top laner, and the enemy has to respect both when they answer him.'),
        flex(2, E('Seraphine', 'Enchanter'), 'SUP / MID', 'SUP / ADC', 'TOP / JNG', 'MID / JNG',
            'Seraphine is drafted as a support and flexed to mid - the wave clear and the ultimate scale fine with real farm behind them.'),
        flex(3, E('Swain', 'Battlemage'), 'MID / SUP', 'MID / TOP', 'JNG / ADC', 'SUP / ADC',
            'Swain flexes mid and support: the pull-and-drain pattern needs no items to function, which is exactly what makes it a support pick.'),
        flex(3, E('Galio', 'Warden'), 'MID / SUP', 'MID / TOP', 'ADC / JNG', 'SUP / JNG',
            'Galio is a mid laner whose ultimate is a global peel button, so he plays support any time the draft wants that ultimate on a second body.'),
        flex(3, E('Ziggs', 'Artillery Mage'), 'MID / ADC', 'MID / SUP', 'TOP / JNG', 'JNG / ADC',
            'Ziggs was flexed into the bot lane for exactly one reason: turret damage. Same champion, different lane, and the enemy draft is now wrong.'),
    ];

    // ---------- scouting noise (difficulty 2+) -----------------------------
    const CHATTER = [
        'Scouting note: their coach has not lost a blue-side draft in six weeks.',
        'Scouting note: 14.4 shifted jungle XP - early skirmish picks are up eight percent.',
        'Scouting note: the enemy support has three games on this patch, all losses.',
        'Scouting note: they have banned the same top laner in nine straight drafts.',
        'Scouting note: their mid trades the first back timer away in almost every game.',
        'Scouting note: last series they saved this pick for the red-side counter.',
        'Scouting note: analyst desk says the tank meta is one patch from ending.',
        'Scouting note: their bot lane has never played from behind this split.',
    ];

    // ---------- helpers ---------------------------------------------------
    function shuffle(a) {
        const arr = a.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }
    function pickFrom(list, diff, count) {
        return shuffle(list)
            .map(function (p) { return { p: p, w: Math.abs((p.tier || 2) - diff) + Math.random() * 0.65 }; })
            .sort(function (a, b) { return a.w - b.w; })
            .slice(0, count)
            .map(function (s) { return s.p; });
    }
    function expandBoard(b) {
        return [
            {
                type: 'comp', tag: 'Comp Hole', tier: b.tier, lane: b.slot,
                ctxLabel: 'Your four locks', ctx: b.team, note: b.note,
                prompt: 'Four picks are locked. What must the fifth pick provide?',
                opts: b.needOpts, why: b.whyNeed,
            },
            {
                type: 'comp', tag: 'Comp Hole', tier: b.tier, lane: b.slot,
                ctxLabel: 'Your four locks', ctx: b.team, note: b.note,
                prompt: 'The comp is missing ' + b.need + '. Which pick supplies it?',
                opts: b.fillOpts, why: b.whyFill,
            },
        ];
    }
    function buildRound(n, diff) {
        const c = pickFrom(COUNTERS, diff, 6);
        const b = pickFrom(BANS, diff, 4);
        const f = pickFrom(FLEXES, diff, 5);
        const comp = [];
        pickFrom(BOARDS, diff, 3).forEach(function (bd) {
            expandBoard(bd).forEach(function (p) { comp.push(p); });
        });
        const order = ['c', 'f', 'm', 'm', 'b', 'c', 'f', 'b', 'c', 'm', 'm', 'f', 'b', 'c', 'f', 'm', 'm', 'b', 'c', 'f'];
        const out = [];
        let ci = 0, bi = 0, fi = 0, mi = 0;
        for (let k = 0; k < order.length && out.length < n; k++) {
            const t = order[k];
            if (t === 'c' && ci < c.length) out.push(c[ci++]);
            else if (t === 'b' && bi < b.length) out.push(b[bi++]);
            else if (t === 'f' && fi < f.length) out.push(f[fi++]);
            else if (t === 'm' && mi < comp.length) out.push(comp[mi++]);
        }
        const rest = c.slice(ci).concat(b.slice(bi), f.slice(fi), comp.slice(mi));
        let ri = 0;
        while (out.length < n && ri < rest.length) out.push(rest[ri++]);
        return out.slice(0, n).map(function (p, i) {
            return Object.assign({}, p, {
                opts: shuffle(p.opts),
                chatter: CHATTER[(Math.floor(Math.random() * CHATTER.length) + i) % CHATTER.length],
            });
        });
    }

    // ---------- runtime state ---------------------------------------------
    let state = 'intro';           // intro | playing | result
    let phase = 'read';            // read | ask | reveal
    let readLeft = 0;
    let readCap = 4;
    let round = [];
    let idx = 0;
    let results = [];
    let bankLeft = 0;
    let bankMax = 1;
    let puzzleLeft = 0;
    let puzzleCap = 10;
    let puzzlePar = 10;
    // What puzzleLeft was actually initialised to for THIS board. It is not
    // always puzzleCap: a nearly-empty bank starts the board with less. Without
    // it, `used` counts time the player never had, and a board opened on a thin
    // bank is scored as though it had already been agonised over.
    let puzzleStart = 0;
    let streak = 0;
    let bestStreak = 0;
    let lastMark = '';             // clean | half | miss | timeout
    let roundName = '';
    let finished = false;
    let scoreOut = 0;
    let metaOut = null;
    let reduceMotion = false;

    let rafId = null;
    let revealTimer = null;
    let lastTs = 0;
    let mq = null;
    let mqHandler = null;

    $: cur = round[idx] || null;
    $: puzzleFrac = puzzleCap > 0 ? Math.max(0, Math.min(1, puzzleLeft / puzzleCap)) : 0;
    $: bankFrac = bankMax > 0 ? Math.max(0, Math.min(1, bankLeft / bankMax)) : 0;
    $: urgent = phase === 'ask' && puzzleFrac < 0.28;

    // ---------- lifecycle -------------------------------------------------
    onMount(function () {
        if (typeof window !== 'undefined' && window.matchMedia) {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            reduceMotion = !!mq.matches;
            mqHandler = function (e) { reduceMotion = !!e.matches; };
            if (mq.addEventListener) mq.addEventListener('change', mqHandler);
            else if (mq.addListener) mq.addListener(mqHandler);
        }
        if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
    });

    onDestroy(function () {
        stopLoop();
        if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
        if (mq && mqHandler) {
            if (mq.removeEventListener) mq.removeEventListener('change', mqHandler);
            else if (mq.removeListener) mq.removeListener(mqHandler);
        }
        mq = null; mqHandler = null;
    });

    function stopLoop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        lastTs = 0;
    }

    function loop(ts) {
        rafId = requestAnimationFrame(loop);
        if (!lastTs) { lastTs = ts; return; }
        const dt = Math.min(0.25, (ts - lastTs) / 1000);
        lastTs = ts;
        if (state !== 'playing') return;
        if (phase === 'read') {
            readLeft -= dt;
            if (readLeft <= 0) { readLeft = 0; beginAnswer(); }
            return;
        }
        if (phase !== 'ask') return;
        puzzleLeft -= dt;
        bankLeft -= dt;
        if (bankLeft <= 0) { bankLeft = 0; puzzleLeft = 0; record(-1, 0, true); return; }
        if (puzzleLeft <= 0) { puzzleLeft = 0; record(-1, 0, false); }
    }

    // ---------- round flow -------------------------------------------------
    function startRound() {
        const c = DIFFS[dLevel];
        roundName = c.name;
        puzzleCap = c.cap;
        puzzlePar = Math.max(0.1, Number(c.par) || c.cap);
        readCap = c.read;
        bankMax = c.bank;
        bankLeft = c.bank;
        round = buildRound(c.picks, dLevel);
        results = [];
        idx = 0;
        streak = 0;
        bestStreak = 0;
        lastMark = '';
        finished = false;
        phase = 'read';
        readLeft = readCap;
        puzzleLeft = Math.min(puzzleCap, bankLeft);
        puzzleStart = puzzleLeft;
        state = 'playing';
        stopLoop();
        rafId = requestAnimationFrame(loop);
    }

    // Neither the puzzle cap nor the shared bank moves until this runs.
    function beginAnswer() {
        if (state !== 'playing' || phase !== 'read') return;
        phase = 'ask';
        puzzleLeft = Math.min(puzzleCap, bankLeft);
        puzzleStart = puzzleLeft;
        if (puzzleLeft <= 0) endRound();
    }

    function answer(i) {
        if (state !== 'playing' || phase !== 'ask') return;
        const p = round[idx];
        if (!p) return;
        const opt = p.opts[i];
        if (!opt) return;
        record(i, opt.credit, false);
    }

    function record(chosen, credit, bankOut) {
        if (phase !== 'ask') return;
        const puzzle = round[idx];
        if (!puzzle) return;
        const used = Math.max(0, puzzleStart - puzzleLeft);
        // Against par, not against the cap. Widening the cap must not hand out a
        // bigger decisiveness bonus for an identical pick.
        const frac = Math.max(0, Math.min(1, 1 - used / puzzlePar));
        // Decisiveness weight: recognising the board instantly is the skill being
        // trained, so a correct-but-agonised pick keeps only 62% of its credit.
        const weight = 0.62 + 0.38 * frac;
        const weighted = credit * weight;
        let mark = 'miss';
        if (chosen < 0) mark = 'timeout';
        else if (credit >= 1) mark = 'clean';
        else if (credit > 0) mark = 'half';

        if (mark === 'clean') { streak += 1; if (streak > bestStreak) bestStreak = streak; }
        else if (mark !== 'half') { streak = 0; }

        results = results.concat([{
            puzzle: puzzle, chosen: chosen, credit: credit, weighted: weighted,
            ms: Math.round(used * 1000), mark: mark,
        }]);
        lastMark = mark;
        phase = 'reveal';

        if (revealTimer) clearTimeout(revealTimer);
        revealTimer = setTimeout(function () {
            revealTimer = null;
            if (bankOut || idx + 1 >= round.length) { endRound(); return; }
            idx += 1;
            phase = 'read';
            readLeft = readCap;
            puzzleLeft = Math.min(puzzleCap, bankLeft);
        puzzleStart = puzzleLeft;
            if (puzzleLeft <= 0) endRound();
        }, REVEAL_MS);
    }

    function endRound() {
        stopLoop();
        if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
        const filled = results.slice();
        while (filled.length < round.length) {
            filled.push({
                puzzle: round[filled.length], chosen: -1, credit: 0, weighted: 0,
                ms: 0, mark: 'timeout', skipped: true,
            });
        }
        results = filled;

        const total = Math.max(1, round.length);
        let sumW = 0, sumC = 0, hits = 0, halves = 0, misses = 0, timeouts = 0, sumMs = 0, answered = 0;
        results.forEach(function (r) {
            sumW += r.weighted;
            sumC += r.credit;
            if (r.mark === 'clean') hits += 1;
            else if (r.mark === 'half') halves += 1;
            else if (r.mark === 'timeout') { timeouts += 1; misses += 1; }
            else misses += 1;
            if (r.chosen >= 0) { sumMs += r.ms; answered += 1; }
        });
        // Rescale so a four-option coin flip lands near 0.15 instead of 0.33.
        const raw = sumW / total;
        const score = Math.max(0, Math.min(1, (raw - 0.08) / 0.92));
        const accuracy = sumC / total;
        const avgMs = answered > 0 ? Math.round(sumMs / answered) : 0;
        const label = verdictFor(score);
        const detail = hits + '/' + total + ' clean, ' + halves + ' playable, ' + timeouts +
            ' on the clock, ' + (avgMs / 1000).toFixed(1) + 's average call';

        scoreOut = score;
        metaOut = {
            label: label,
            accuracy: Math.round(accuracy * 1000) / 1000,
            hits: hits,
            misses: misses,
            streak: streak,
            best: bestStreak,
            detail: detail,
            defensible: halves,
            timeouts: timeouts,
            puzzles: total,
            avgMs: avgMs,
            difficulty: dLevel,
        };
        state = 'result';
    }

    function verdictFor(s) {
        if (s >= 0.90) return 'Draft Room Savant';
        if (s >= 0.78) return 'Trusted On Anything';
        if (s >= 0.62) return 'Solid Pool';
        if (s >= 0.45) return 'Narrow Pool';
        if (s >= 0.28) return 'One-Trick Tendencies';
        return 'Lost In Draft';
    }
    function verdictLine(s) {
        if (s >= 0.90) return 'You read every board before the timer moved. Coach can hand you anything.';
        if (s >= 0.78) return 'Fast, correct, and you knew why. That is a pool worth drafting around.';
        if (s >= 0.62) return 'You saw most of it. The hesitation is what cost you, not the knowledge.';
        if (s >= 0.45) return 'Comfortable on the obvious boards, guessing on the rest. Study the counters.';
        if (s >= 0.28) return 'Too many picks made on feel. Learn what each pick is actually for.';
        return 'The draft got away from you. Start with the counter matchups you play every day.';
    }

    function finishSession() {
        if (finished) return;
        finished = true;
        if (typeof onComplete === 'function') onComplete(scoreOut, metaOut);
    }
    function quit() {
        if (typeof onQuit === 'function') onQuit();
    }

    function onKey(e) {
        if (e.defaultPrevented) return;
        if (state === 'playing' && phase === 'read') {
            if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
                e.preventDefault();
                beginAnswer();
            }
            return;
        }
        if (state === 'playing' && phase === 'ask') {
            if (e.key >= '1' && e.key <= '4') {
                e.preventDefault();
                answer(parseInt(e.key, 10) - 1);
            }
            return;
        }
        if (state === 'intro' && e.key === 'Escape') { e.preventDefault(); quit(); }
    }

    // ---------- view helpers ----------------------------------------------
    // `ph` and `last` are passed in rather than read from scope so Svelte sees
    // them as dependencies of the class expression in the markup.
    function optState(opt, i, ph, last) {
        if (ph !== 'reveal' || !last) return '';
        if (opt.credit >= 1) return 'right';
        if (last.chosen === i && opt.credit > 0) return 'half';
        if (last.chosen === i) return 'wrong';
        return 'dim';
    }
    const MARK_TEXT = { clean: 'Clean read', half: 'Playable', miss: 'Wrong call', timeout: 'Out of time' };
    $: lastResult = results.length ? results[results.length - 1] : null;
    $: scorePct = Math.round(scoreOut * 100);
</script>

<div class="dr" class:reduce={reduceMotion}>

    {#if state === 'intro'}
        <!-- ============================ INTRO ============================ -->
        <div class="panel-box intro">
            <div class="eyebrow">Champion Pool &middot; CHP</div>
            <h2 class="title">{drill && drill.name ? drill.name : 'Draft Room'}</h2>
            <p class="lede">
                {drill && drill.desc
                    ? drill.desc
                    : 'Breadth is not how many champions you own, it is how many boards you can read. The Draft Room feeds you live draft problems - counter picks, comp holes, ban decisions and flex reads - and asks you to solve them at the speed a draft actually moves. Knowing the answer late is the same as not knowing it.'}
            </p>

            <div class="howto">
                <div class="howto-h">How to play</div>
                <ul class="howto-list">
                    <li><span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span><span class="kbd">4</span> or click a card to lock your answer.</li>
                    <li>One clearly correct pick, one defensible pick worth half credit, two bad ones.</li>
                    <li>Every pick has its own clock, and the whole session shares one time bank. Dithering costs credit.</li>
                </ul>
            </div>

            <div class="diffrow">
                <div class="diffpill">{cfg.name}</div>
                <div class="diffnote">{cfg.blurb}</div>
            </div>

            <div class="btnrow">
                <button class="go" on:click={startRound} aria-label="Start the Draft Room drill">Start Drill</button>
                <button class="back" on:click={quit} aria-label="Leave the drill without scoring">Back</button>
            </div>
        </div>

    {:else if state === 'playing'}
        <!-- =========================== PLAYING =========================== -->
        <div class="hud">
            <div class="hud-left">
                <span class="hud-k">Pick</span>
                <span class="hud-v">{idx + 1}<span class="hud-of">/{round.length}</span></span>
            </div>
            <div class="bank" aria-hidden="true">
                <div class="bank-fill" style="width:{bankFrac * 100}%"></div>
            </div>
            <div class="hud-right">
                <span class="hud-k">Streak</span>
                <span class="hud-v" class:hot={streak >= 3}>{streak}</span>
            </div>
        </div>
        <div class="sr-only" aria-live="polite">Pick {idx + 1} of {round.length}.</div>

        {#if cur}
            <div class="panel-box board">
                <div class="board-top">
                    <span class="type type-{cur.type}">{cur.tag}</span>
                    {#if cur.lane}<span class="lane">{cur.lane}</span>{/if}
                    <span class="clock" class:urgent={urgent}>{puzzleLeft.toFixed(1)}s</span>
                </div>

                <div class="pclock" aria-hidden="true">
                    <div class="pclock-fill" class:urgent={urgent} style="width:{puzzleFrac * 100}%"></div>
                </div>

                <div class="ctx-label">{cur.ctxLabel}</div>
                <div class="chips">
                    {#each cur.ctx as c}
                        <div class="chip">
                            <span class="chip-n">{c.name}</span>
                            <span class="chip-a">{c.arch}</span>
                        </div>
                    {/each}
                </div>

                {#if cur.note}<p class="note">{cur.note}</p>{/if}

                <p class="prompt">{cur.prompt}</p>

                {#if dLevel >= 2}<p class="chatter">{cur.chatter}</p>{/if}

                {#if phase === 'read'}
                    <!-- Read phase: board and question only. Neither the puzzle
                         cap nor the shared bank is ticking. -->
                    <div class="readbox">
                        <p class="read-lbl">Read the board</p>
                        <button class="read-go" type="button" on:click={beginAnswer}>
                            Show Options
                            <span class="read-kbd">Space</span>
                        </button>
                        <p class="read-note">
                            Options in {Math.max(1, Math.ceil(readLeft))}s. Your thinking clock starts then.
                        </p>
                    </div>
                {:else}
                    <!-- Options stay enabled during the reveal so keyboard focus is not
                         thrown back to the body between picks; answer() guards the input. -->
                    <div class="opts" class:locked={phase !== 'ask'} role="group" aria-label="Draft options">
                        {#each cur.opts as opt, i}
                            <button
                                class="opt {optState(opt, i, phase, lastResult)}"
                                on:click={() => answer(i)}
                                aria-disabled={phase !== 'ask'}
                                aria-label={'Option ' + (i + 1) + ': ' + opt.name + (opt.arch ? ', ' + opt.arch : '')}
                            >
                                <span class="okey">{i + 1}</span>
                                <span class="obody">
                                    <span class="oname">{opt.name}</span>
                                    {#if opt.arch}<span class="oarch">{opt.arch}</span>{/if}
                                </span>
                            </button>
                        {/each}
                    </div>
                {/if}

                <div class="reveal" aria-live="polite">
                    {#if phase === 'reveal' && lastResult}
                        <div class="rv rv-{lastMark}">
                            <span class="rv-mark">{MARK_TEXT[lastMark]}</span>
                            <span class="rv-why">{lastResult.puzzle.why}</span>
                        </div>
                    {:else}
                        <div class="rv rv-idle">Lock an answer with 1 - 4.</div>
                    {/if}
                </div>
            </div>
        {/if}

    {:else}
        <!-- ============================ RESULT ============================ -->
        <div class="panel-box result">
            <div class="eyebrow">Session complete &middot; {roundName}</div>

            <div class="scorewrap">
                <div class="ring" style="--p:{scorePct * 3.6}deg" aria-hidden="true">
                    <div class="ring-in">
                        <span class="ring-n">{scorePct}</span>
                        <span class="ring-l">Draft IQ</span>
                    </div>
                </div>
                <div class="scoretext">
                    <div class="verdict">{metaOut ? metaOut.label : ''}</div>
                    <p class="verdict-line">{verdictLine(scoreOut)}</p>
                </div>
            </div>

            <div class="stats">
                <div class="stat"><span class="stat-v good">{metaOut ? metaOut.hits : 0}</span><span class="stat-l">Clean</span></div>
                <div class="stat"><span class="stat-v mid">{metaOut ? metaOut.defensible : 0}</span><span class="stat-l">Playable</span></div>
                <div class="stat"><span class="stat-v bad">{metaOut ? metaOut.misses : 0}</span><span class="stat-l">Missed</span></div>
                <div class="stat"><span class="stat-v">{metaOut ? metaOut.best : 0}</span><span class="stat-l">Best Streak</span></div>
                <div class="stat"><span class="stat-v">{metaOut ? (metaOut.avgMs / 1000).toFixed(1) : '0.0'}s</span><span class="stat-l">Avg Call</span></div>
                <div class="stat"><span class="stat-v">{metaOut ? Math.round(metaOut.accuracy * 100) : 0}%</span><span class="stat-l">Correctness</span></div>
            </div>

            <div class="review-h">Draft review</div>
            <div class="review">
                {#each results as r, i}
                    <div class="rrow">
                        <span class="rnum">{i + 1}</span>
                        <span class="rmark rmark-{r.mark}">{MARK_TEXT[r.mark]}</span>
                        <span class="rbody">
                            <span class="rtag">{r.puzzle.tag}</span>
                            <span class="rwhy">{r.puzzle.why}</span>
                        </span>
                    </div>
                {/each}
            </div>

            <div class="btnrow">
                <button class="go" on:click={finishSession} disabled={finished} aria-label="Finish the session and bank the result">Finish Session</button>
            </div>
        </div>
    {/if}
</div>

<style>
    .dr {
        --acc: #14b8a6;
        --acc-l: #5eead4;
        --acc-d: #0d9488;
        width: 100%;
        max-width: 660px;
        margin: 0 auto;
        color: #c8d6e5;
        font-family: inherit;
    }
    .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    .panel-box {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(20, 184, 166, 0.15);
        border-radius: 20px;
        padding: 20px;
        backdrop-filter: blur(8px);
    }
    @media (max-width: 400px) { .panel-box { padding: 14px; border-radius: 16px; } }

    .eyebrow {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.6px; color: #0f766e;
    }

    /* ---------------- INTRO ---------------- */
    .title { font-size: 24px; font-weight: 900; color: #e2e8f0; margin: 6px 0 10px; line-height: 1.1; }
    .lede { font-size: 13px; line-height: 1.65; color: #7c8ba1; }
    .howto {
        margin-top: 16px; padding: 14px;
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 14px;
    }
    .howto-h {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #334155; margin-bottom: 9px;
    }
    .howto-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
    .howto-list li { font-size: 12px; line-height: 1.5; color: #94a3b8; }
    .kbd {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 4px; margin-right: 3px;
        border-radius: 5px; background: rgba(20, 184, 166, 0.1);
        border: 1px solid rgba(20, 184, 166, 0.25);
        color: var(--acc-l); font-size: 10px; font-weight: 900;
    }
    .diffrow { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
    .diffpill {
        font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px;
        color: #04211d; background: linear-gradient(135deg, var(--acc-d), var(--acc));
        padding: 5px 12px; border-radius: 99px;
    }
    .diffnote { font-size: 11px; color: #475569; font-weight: 600; }

    .btnrow { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    .go {
        flex: 1 1 180px;
        padding: 12px 20px; border-radius: 12px; border: none; cursor: pointer;
        font-family: inherit; font-size: 12px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1px;
        color: #04211d; background: linear-gradient(135deg, var(--acc-d), var(--acc));
        box-shadow: 0 4px 12px rgba(20, 184, 166, 0.2);
        transition: box-shadow .15s ease, transform .15s ease;
    }
    .go:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(20, 184, 166, 0.35); transform: translateY(-1px); }
    .go:disabled { background: rgba(30, 41, 59, 0.6); color: #475569; cursor: not-allowed; box-shadow: none; }
    .back {
        padding: 12px 20px; border-radius: 12px; cursor: pointer;
        font-family: inherit; font-size: 12px; font-weight: 800;
        background: rgba(51, 65, 85, 0.4); color: #94a3b8;
        border: 1px solid rgba(71, 85, 105, 0.3);
    }
    .back:hover { background: rgba(71, 85, 105, 0.55); color: #e2e8f0; }
    .go:focus-visible, .back:focus-visible, .opt:focus-visible {
        outline: 2px solid var(--acc-l); outline-offset: 2px;
    }

    /* ---------------- HUD ---------------- */
    .hud { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .hud-left, .hud-right { display: flex; align-items: baseline; gap: 6px; flex: 0 0 auto; }
    .hud-k {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.2px; color: #334155;
    }
    .hud-v { font-size: 15px; font-weight: 900; color: #cbd5e1; }
    .hud-v.hot { color: var(--acc-l); }
    .hud-of { font-size: 11px; color: #475569; font-weight: 700; }
    .bank { flex: 1 1 auto; height: 5px; border-radius: 99px; background: rgba(15, 23, 42, 0.8); overflow: hidden; }
    .bank-fill { height: 100%; background: linear-gradient(90deg, var(--acc-d), var(--acc-l)); border-radius: 99px; }

    /* ---------------- BOARD ---------------- */
    .board-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .type {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.3px;
        padding: 4px 9px; border-radius: 7px;
        background: rgba(20, 184, 166, 0.1); color: var(--acc-l);
        border: 1px solid rgba(20, 184, 166, 0.2);
    }
    .type-ban { background: rgba(239, 68, 68, 0.09); color: #f87171; border-color: rgba(239, 68, 68, 0.2); }
    .type-comp { background: rgba(59, 130, 246, 0.09); color: #93c5fd; border-color: rgba(59, 130, 246, 0.2); }
    .type-flex { background: rgba(168, 85, 247, 0.09); color: #d8b4fe; border-color: rgba(168, 85, 247, 0.2); }
    .lane {
        font-size: 9px; font-weight: 900; letter-spacing: 1.3px; color: #475569;
        text-transform: uppercase;
    }
    .clock { margin-left: auto; font-size: 13px; font-weight: 900; color: #64748b; font-variant-numeric: tabular-nums; }
    .clock.urgent { color: #fbbf24; }

    .pclock { height: 4px; border-radius: 99px; background: rgba(15, 23, 42, 0.85); overflow: hidden; margin-bottom: 14px; }
    .pclock-fill { height: 100%; background: linear-gradient(90deg, var(--acc-d), var(--acc-l)); border-radius: 99px; }
    .pclock-fill.urgent { background: linear-gradient(90deg, #b45309, #fbbf24); }
    .dr:not(.reduce) .pclock-fill.urgent { animation: pulseBar 0.9s ease-in-out infinite; }
    @keyframes pulseBar { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

    .ctx-label {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #334155; margin-bottom: 7px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
        display: flex; flex-direction: column; gap: 1px;
        padding: 6px 10px; border-radius: 10px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.3);
        min-width: 0;
    }
    .chip-n { font-size: 12px; font-weight: 800; color: #cbd5e1; line-height: 1.15; }
    .chip-a { font-size: 8.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.7px; }

    .note {
        margin-top: 10px; font-size: 11.5px; line-height: 1.5; color: #64748b;
        border-left: 2px solid rgba(20, 184, 166, 0.25); padding-left: 9px;
    }
    .prompt { margin-top: 12px; font-size: 14px; font-weight: 700; line-height: 1.45; color: #e2e8f0; }
    .chatter { margin-top: 5px; font-size: 10px; color: #3d4a5c; font-style: italic; }

    /* ---- read phase ---- roughly the height of the 2x2 option grid, so the
       board does not jump when the options arrive. */
    .readbox {
        margin-top: 13px; min-height: 132px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 11px;
        padding: 18px 16px; border-radius: 14px;
        background: rgba(12, 16, 28, 0.4);
        border: 1px dashed rgba(71, 85, 105, 0.32);
    }
    .read-lbl {
        font-size: 9px; font-weight: 900; letter-spacing: 2px;
        text-transform: uppercase; color: #475569;
    }
    .read-go {
        display: inline-flex; align-items: center; gap: 10px;
        padding: 11px 22px; border-radius: 12px;
        border: 1px solid rgba(100, 116, 139, 0.4);
        background: rgba(51, 65, 85, 0.42);
        color: #e2e8f0; font-family: inherit;
        font-size: 12px; font-weight: 900;
        letter-spacing: 1.1px; text-transform: uppercase; cursor: pointer;
    }
    .read-go:hover { background: rgba(71, 85, 105, 0.6); }
    .read-go:focus-visible { outline: 2px solid #94a3b8; outline-offset: 2px; }
    .read-kbd {
        font-size: 9px; font-weight: 800; letter-spacing: 1px;
        padding: 3px 8px; border-radius: 6px;
        background: rgba(0, 0, 0, 0.28); color: rgba(226, 232, 240, 0.65);
    }
    .read-note { font-size: 10.5px; color: #475569; font-weight: 600; text-align: center; }

    .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 13px; }
    @media (max-width: 420px) { .opts { grid-template-columns: 1fr; } }
    .opt {
        display: flex; align-items: center; gap: 9px; text-align: left;
        padding: 10px 11px; border-radius: 12px; cursor: pointer;
        font-family: inherit;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.35);
        transition: border-color .12s ease, background .12s ease;
        min-width: 0;
    }
    .opts:not(.locked) .opt:hover { border-color: rgba(20, 184, 166, 0.45); background: rgba(20, 184, 166, 0.07); }
    .opts.locked .opt { cursor: default; }
    .okey {
        flex: 0 0 auto;
        width: 20px; height: 20px; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(51, 65, 85, 0.4); color: #64748b;
        font-size: 10px; font-weight: 900;
    }
    .obody { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .oname { font-size: 12.5px; font-weight: 800; color: #cbd5e1; line-height: 1.15; }
    .oarch { font-size: 8.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.7px; }

    .opt.right { border-color: rgba(20, 184, 166, 0.7); background: rgba(20, 184, 166, 0.12); }
    .opt.right .oname, .opt.right .okey { color: var(--acc-l); }
    .opt.half { border-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.09); }
    .opt.half .oname { color: #fbbf24; }
    .opt.wrong { border-color: rgba(239, 68, 68, 0.55); background: rgba(239, 68, 68, 0.09); }
    .opt.wrong .oname { color: #f87171; }
    .opt.dim { opacity: 0.42; }

    .reveal { margin-top: 12px; min-height: 46px; }
    .rv {
        font-size: 11.5px; line-height: 1.5; padding: 9px 11px; border-radius: 11px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.22);
        color: #7c8ba1;
    }
    .rv-mark {
        display: inline-block; font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.2px; margin-right: 7px;
    }
    .rv-clean { border-color: rgba(20, 184, 166, 0.3); }
    .rv-clean .rv-mark { color: var(--acc-l); }
    .rv-half { border-color: rgba(245, 158, 11, 0.3); }
    .rv-half .rv-mark { color: #fbbf24; }
    .rv-miss, .rv-timeout { border-color: rgba(239, 68, 68, 0.3); }
    .rv-miss .rv-mark, .rv-timeout .rv-mark { color: #f87171; }
    .rv-idle { color: #334155; font-style: italic; }
    .rv-why { color: #94a3b8; }

    /* ---------------- RESULT ---------------- */
    .scorewrap { display: flex; align-items: center; gap: 16px; margin: 14px 0 16px; flex-wrap: wrap; }
    .ring {
        flex: 0 0 auto;
        width: 96px; height: 96px; border-radius: 50%;
        background: conic-gradient(var(--acc) var(--p), rgba(30, 41, 59, 0.65) 0);
        display: flex; align-items: center; justify-content: center;
    }
    .ring-in {
        width: 78px; height: 78px; border-radius: 50%;
        background: #0a0f1c;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .ring-n { font-size: 28px; font-weight: 900; color: var(--acc-l); line-height: 1; }
    .ring-l {
        font-size: 8px; font-weight: 900; color: #475569;
        text-transform: uppercase; letter-spacing: 1.2px; margin-top: 3px;
    }
    .scoretext { flex: 1 1 200px; min-width: 0; }
    .verdict { font-size: 19px; font-weight: 900; color: #e2e8f0; line-height: 1.15; }
    .verdict-line { font-size: 12px; line-height: 1.55; color: #64748b; margin-top: 5px; }

    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
    @media (max-width: 420px) { .stats { grid-template-columns: repeat(2, 1fr); } }
    .stat {
        background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(51, 65, 85, 0.18);
        border-radius: 12px; padding: 10px 8px; text-align: center;
    }
    .stat-v { display: block; font-size: 17px; font-weight: 900; color: #cbd5e1; line-height: 1; }
    .stat-v.good { color: var(--acc-l); }
    .stat-v.mid { color: #fbbf24; }
    .stat-v.bad { color: #f87171; }
    .stat-l {
        display: block; font-size: 8px; font-weight: 800; color: #475569;
        text-transform: uppercase; letter-spacing: 0.8px; margin-top: 4px;
    }

    .review-h {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #334155; margin: 16px 0 8px;
    }
    .review {
        max-height: 190px; overflow-y: auto;
        display: flex; flex-direction: column; gap: 6px;
        padding-right: 4px;
    }
    .rrow {
        display: flex; gap: 8px; align-items: flex-start;
        background: rgba(15, 23, 42, 0.35);
        border: 1px solid rgba(51, 65, 85, 0.16);
        border-radius: 10px; padding: 8px 9px;
    }
    .rnum { flex: 0 0 auto; font-size: 10px; font-weight: 900; color: #334155; min-width: 14px; }
    .rmark {
        flex: 0 0 auto; font-size: 8.5px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 0.9px; padding: 2px 6px; border-radius: 5px; margin-top: 1px;
        background: rgba(51, 65, 85, 0.35); color: #64748b; white-space: nowrap;
    }
    .rmark-clean { background: rgba(20, 184, 166, 0.12); color: var(--acc-l); }
    .rmark-half { background: rgba(245, 158, 11, 0.12); color: #fbbf24; }
    .rmark-miss, .rmark-timeout { background: rgba(239, 68, 68, 0.12); color: #f87171; }
    .rbody { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .rtag { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #334155; }
    .rwhy { font-size: 11px; line-height: 1.45; color: #7c8ba1; }
</style>
