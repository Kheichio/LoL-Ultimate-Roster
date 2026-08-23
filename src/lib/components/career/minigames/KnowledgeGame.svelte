<script>
    // ===================================================================
    //  THEORY SESSION  -  Game Knowledge (knw) training drill
    //  A fast recall quiz on the numbers pros have memorised: objective
    //  timers, item components, gold values, rule interactions and macro
    //  defaults. Self-contained: no stores, no career imports, no assets.
    // ===================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;      // 1 Basic, 2 Advanced, 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    const ACCENT = '#94a3b8';
    const ICON = '\u{1F4D6}';

    // -- Categories ----------------------------------------------------
    const CATS = [
        { id: 'TIMERS',    label: 'Timers',    color: '#38bdf8' },
        { id: 'ITEMS',     label: 'Items',     color: '#f59e0b' },
        { id: 'NUMBERS',   label: 'Numbers',   color: '#22c55e' },
        { id: 'MECHANICS', label: 'Mechanics', color: '#a855f7' },
        { id: 'META',      label: 'Meta',      color: '#ec4899' },
    ];
    const CAT_BY_ID = CATS.reduce(function (m, c) { m[c.id] = c; return m; }, {});

    // -- Question bank -------------------------------------------------
    //  c = category, t = depth tier (1 fundamental .. 3 deep),
    //  o = options (index 0 is the correct one; options are shuffled at
    //  runtime), e = one-sentence explanation shown after the answer.
    const BANK = [
        // -- TIMERS ---------------------------------------------------
        { c: "TIMERS", t: 1, q: "How long after being killed does Baron Nashor respawn?",
          o: ["6 minutes", "4 minutes", "5 minutes", "7 minutes"],
          e: "Baron is on a six minute respawn, so the next spawn is already on the clock the second it dies." },
        { c: "TIMERS", t: 1, q: "How long after being slain does a Dragon respawn?",
          o: ["5 minutes", "3 minutes", "4 minutes", "6 minutes"],
          e: "Five minutes between drakes, which is why a lost dragon sets the next timer rather than ending the argument." },
        { c: "TIMERS", t: 2, q: "How long does the Baron buff last on a champion who stays alive?",
          o: ["3 minutes", "90 seconds", "2 minutes", "4 minutes"],
          e: "Three minutes, and it is lost on death - so the buff is a push window, not a reason to reset." },
        { c: "TIMERS", t: 1, q: "How long is a standard, uninterrupted recall channel?",
          o: ["8 seconds", "4 seconds", "6 seconds", "10 seconds"],
          e: "Eight seconds, and every reset decision in lane is really a question of whether you have those eight seconds." },
        { c: "TIMERS", t: 2, q: "How long do the Blue and Red jungle buffs last once you have taken them?",
          o: ["2 minutes", "90 seconds", "2 minutes 30 seconds", "3 minutes"],
          e: "Both buffs run two minutes, so tracking an enemy buff really means tracking a two minute loop." },
        { c: "TIMERS", t: 1, q: "How often does a new minion wave spawn?",
          o: ["Every 30 seconds", "Every 20 seconds", "Every 25 seconds", "Every 45 seconds"],
          e: "A wave every thirty seconds is the metronome the entire laning phase runs on." },
        { c: "TIMERS", t: 2, q: "When does the first minion wave spawn from the Nexus?",
          o: ["1:05", "0:55", "1:00", "1:30"],
          e: "Minions spawn at 1:05 and meet in the middle of a side lane a little over half a minute later." },
        { c: "TIMERS", t: 2, q: "In the first fifteen minutes, how often does a wave contain a siege (cannon) minion?",
          o: ["Every third wave", "Every second wave", "Every fourth wave", "Every fifth wave"],
          e: "Early on the cannon comes every third wave; later it becomes every second wave, then every wave." },
        { c: "TIMERS", t: 2, q: "When do the jungle camps first spawn at the start of a game?",
          o: ["1:30", "0:00", "1:05", "2:00"],
          e: "Camps pop at 1:30, which is why a jungler is walking to their opener before the minions have even met." },
        { c: "TIMERS", t: 2, q: "How long after an Inhibitor is destroyed does it come back?",
          o: ["5 minutes", "3 minutes", "4 minutes", "6 minutes"],
          e: "Five minutes of super minions is the reward, and it is the clock a team plays their whole close-out around." },
        { c: "TIMERS", t: 1, q: "How long after a turret is destroyed does it respawn?",
          o: ["It never respawns", "5 minutes", "8 minutes", "At the next Baron spawn"],
          e: "Turrets are permanent - once that ground is gone, it is gone for the rest of the game." },
        { c: "TIMERS", t: 3, q: "Your team kills Baron at 24:00 and nobody touches the pit again. When is the next Baron up?",
          o: ["30:00", "28:00", "29:00", "32:00"],
          e: "Six minutes from the kill, so the call for the next setup starts around 29:00, not 30:00." },
        { c: "TIMERS", t: 3, q: "A drake dies at 18:20. When should your team start moving for the next one?",
          o: ["Around 22:40, roughly half a minute before it spawns", "Right at 23:20", "Around 20:00", "Only once it appears on the scoreboard"],
          e: "It respawns at 23:20, so vision and position go down 30 to 60 seconds early - arriving on time means arriving late." },

        // -- ITEMS ----------------------------------------------------
        { c: "ITEMS", t: 1, q: "Which basic component grants Attack Damage?",
          o: ["B. F. Sword", "Cloak of Agility", "Ruby Crystal", "Null-Magic Mantle"],
          e: "B. F. Sword is the big AD brick; Cloak is crit, Ruby is health and Null-Magic Mantle is magic resist." },
        { c: "ITEMS", t: 1, q: "Which of these components grants the most Ability Power on its own?",
          o: ["Needlessly Large Rod", "Amplifying Tome", "Blasting Wand", "Fiendish Codex"],
          e: "The Rod is the largest single AP component - Tome, Codex and Wand all give less." },
        { c: "ITEMS", t: 1, q: "Cloak of Agility grants which stat?",
          o: ["Critical strike chance", "Attack speed", "Attack damage", "Ability haste"],
          e: "Cloak is pure crit chance, which is why it only shows up in marksman and crit-assassin builds." },
        { c: "ITEMS", t: 2, q: "Zeal is built out of which two components?",
          o: ["Dagger and Brawlers Gloves", "Dagger and Cloak of Agility", "Long Sword and Dagger", "Brawlers Gloves and Cloak of Agility"],
          e: "Dagger for attack speed plus Brawlers Gloves for crit - Zeal is the root of every movement-speed crit item." },
        { c: "ITEMS", t: 2, q: "Which component do all Spellblade items build out of?",
          o: ["Sheen", "Kindlegem", "Phage", "Amplifying Tome"],
          e: "Sheen carries Spellblade, so Trinity Force, Essence Reaver, Iceborn Gauntlet and Lich Bane all start from it." },
        { c: "ITEMS", t: 2, q: "What triggers a Spellblade passive?",
          o: ["Casting an ability, which empowers your next basic attack", "Landing three basic attacks in a row", "Dropping below 30 percent health", "Killing a minion or a monster"],
          e: "It is an ability-then-auto pattern, which is why good bruisers weave a basic attack between every cast." },
        { c: "ITEMS", t: 2, q: "Which boots upgrade grants Tenacity?",
          o: ["Mercurys Treads", "Plated Steelcaps", "Ionian Boots of Lucidity", "Boots of Swiftness"],
          e: "Mercurys Treads pair magic resist with tenacity - the default answer to a heavy crowd control composition." },
        { c: "ITEMS", t: 2, q: "Which boots upgrade reduces the damage you take from basic attacks?",
          o: ["Plated Steelcaps", "Mercurys Treads", "Berserkers Greaves", "Sorcerers Shoes"],
          e: "Steelcaps cut incoming basic attack damage, so they are bought against marksmen and auto-attackers, not mages." },
        { c: "ITEMS", t: 2, q: "Ionian Boots of Lucidity are bought mainly for which stat?",
          o: ["Ability Haste", "Attack speed", "Magic penetration", "Armour"],
          e: "Ability haste on your spells and your summoners - the boots for anyone whose value is casting more often." },
        { c: "ITEMS", t: 1, q: "Which starter item gives Attack Damage and Health?",
          o: ["Dorans Blade", "Dorans Ring", "Dorans Shield", "Cull"],
          e: "Blade is the aggressive opener: damage plus a health buffer for the level one and two fights." },
        { c: "ITEMS", t: 2, q: "You buy two different items that carry the same Unique passive. What happens?",
          o: ["The passive only applies once - the second copy is wasted", "It stacks at half strength", "It stacks fully", "The shop blocks the purchase"],
          e: "Unique passives never stack with themselves, so doubling up on the same effect is a quiet gold loss." },
        { c: "ITEMS", t: 2, q: "Which of these items builds out of Zeal?",
          o: ["Phantom Dancer", "The Bloodthirster", "Black Cleaver", "Guardian Angel"],
          e: "Phantom Dancer is a Zeal item, which is where its attack speed, crit and movement speed all come from." },
        { c: "ITEMS", t: 1, q: "Negatron Cloak grants which defensive stat?",
          o: ["Magic resist", "Armour", "Health", "Tenacity"],
          e: "Negatron is the magic resist component - the first buy into a double AP composition." },
        { c: "ITEMS", t: 3, q: "Which component grants Health and nothing else?",
          o: ["Ruby Crystal", "Cloth Armour", "Null-Magic Mantle", "Rejuvenation Bead"],
          e: "Ruby Crystal is flat health; Cloth is armour, Null-Magic is magic resist and the Bead is health regeneration." },

        // -- NUMBERS --------------------------------------------------
        { c: "NUMBERS", t: 1, q: "In the early game, how much gold does a melee minion give you for the last hit?",
          o: ["21", "14", "17", "25"],
          e: "Twenty-one gold per melee minion - the number every CS-per-minute conversation is built on." },
        { c: "NUMBERS", t: 2, q: "In the early game, how much gold does a ranged (caster) minion give you for the last hit?",
          o: ["14", "10", "17", "21"],
          e: "Casters pay fourteen, clearly less than a melee minion, which is why the back line is the one you can afford to drop." },
        { c: "NUMBERS", t: 1, q: "Which minion in a wave is worth the most gold?",
          o: ["The siege (cannon) minion", "The melee minions", "The caster minions", "They are all worth the same"],
          e: "The cannon is worth roughly three casters, so missing one cannon hurts far more than missing a caster." },
        { c: "NUMBERS", t: 1, q: "How many dragons does a team need to take before they earn a Dragon Soul?",
          o: ["4", "3", "5", "2"],
          e: "The soul lands on the fourth dragon, which is why the fourth one is the one worth throwing the game at." },
        { c: "NUMBERS", t: 1, q: "How many turret plates does each outer turret carry?",
          o: ["5", "3", "4", "6"],
          e: "Five plates per outer turret, and taking all five is worth more than a kill." },
        { c: "NUMBERS", t: 2, q: "At what point in the game do turret plates fall off?",
          o: ["14:00", "10:00", "12:00", "15:00"],
          e: "Plates drop at fourteen minutes, which is the deadline on every early dive and every hard shove." },
        { c: "NUMBERS", t: 2, q: "Roughly how much gold is a single turret plate worth?",
          o: ["About 160, shared between the champions nearby", "About 40", "About 90", "About 320"],
          e: "Around a hundred and sixty gold a plate - two plates are worth more than a full wave." },
        { c: "NUMBERS", t: 2, q: "What is the base bounty for killing an enemy champion with no shutdown and no kill streak?",
          o: ["300 gold", "200 gold", "250 gold", "400 gold"],
          e: "Three hundred gold flat, which is why a kill plus a plate is worth about a wave and a half of farm." },
        { c: "NUMBERS", t: 1, q: "How much gold do you start a normal Summoners Rift game with?",
          o: ["500", "300", "450", "650"],
          e: "Five hundred gold, which is exactly why the starting item choice is a real choice." },
        { c: "NUMBERS", t: 1, q: "How much does a Control Ward cost?",
          o: ["75 gold", "50 gold", "100 gold", "125 gold"],
          e: "Seventy-five gold for permanent vision and vision denial - the best gold-per-value purchase in the shop." },
        { c: "NUMBERS", t: 2, q: "How many minions are in a standard early wave with no cannon?",
          o: ["6 - three melee and three casters", "5", "7", "4"],
          e: "Three melee and three casters, so a full wave you never touch is roughly a hundred gold gone." },
        { c: "NUMBERS", t: 2, q: "What is the main thing that makes your death timer longer as the game goes on?",
          o: ["Your champion level", "How many times you have died", "How far behind in gold you are", "How many turrets your team has lost"],
          e: "Base death timers scale off your level, then get stretched further by a late-game time multiplier." },
        { c: "NUMBERS", t: 3, q: "Late-game death timers get stretched by an extra percentage on top of the level-based timer. Roughly when does that scaling begin?",
          o: ["Around 15 minutes", "Around 5 minutes", "Around 30 minutes", "Only once an inhibitor falls"],
          e: "The time-based increase starts mid-game and keeps climbing, which is why one late death can end a game." },

        // -- MECHANICS ------------------------------------------------
        { c: "MECHANICS", t: 2, q: "How does Tenacity from several different sources combine?",
          o: ["Multiplicatively - each extra source is worth less than the last", "It adds up directly", "Only the single largest source applies", "It is hard capped at 30 percent"],
          e: "Two 30 percent sources give about 51 percent, not 60 - tenacity has real diminishing returns." },
        { c: "MECHANICS", t: 2, q: "Which of these does Tenacity NOT shorten?",
          o: ["Knock-ups", "Stuns", "Roots", "Silences"],
          e: "Airborne effects and suppression ignore tenacity completely, so buying it into a knock-up comp does nothing." },
        { c: "MECHANICS", t: 3, q: "Tenacity does nothing to a slow. What actually shortens slows?",
          o: ["Slow Resist, a separate stat", "Extra movement speed", "Armour", "Nothing shortens a slow"],
          e: "Slows are handled by Slow Resist, which is why tenacity boots are the wrong answer to a poke and slow composition." },
        { c: "MECHANICS", t: 3, q: "When a target is hit by both percentage and flat armour penetration, which applies first?",
          o: ["Percentage penetration first, then flat", "Flat penetration first, then percentage", "Whichever is larger applies first", "They are averaged together"],
          e: "Percent pen cuts the armour first and flat pen shaves what is left, so lethality is strongest into already-squishy targets." },
        { c: "MECHANICS", t: 2, q: "Can armour penetration take a target below zero armour?",
          o: ["No, it stops at zero", "Yes, into negative armour", "Yes, but only lethality can", "Only against turrets and structures"],
          e: "Penetration never goes past zero, so extra pen into a target with almost no armour is a wasted stat." },
        { c: "MECHANICS", t: 2, q: "Lethality converts into flat armour penetration based on what?",
          o: ["The level of the champion who owns it", "The level of the target", "The current armour of the target", "The game clock"],
          e: "Lethality scales with your own level, so a lethality item is worth less at level 3 than it is at level 13." },
        { c: "MECHANICS", t: 1, q: "Which damage type is reduced by neither Armour nor Magic Resist?",
          o: ["True damage", "Physical damage", "Magic damage", "Adaptive damage"],
          e: "True damage ignores both resistances, which is why a little of it beats a lot of raw damage into a tank." },
        { c: "MECHANICS", t: 1, q: "How many Control Wards can one player have on the map at once?",
          o: ["1", "2", "3", "Unlimited"],
          e: "One per player - placing a second removes the first, so pink placement is a real decision." },
        { c: "MECHANICS", t: 2, q: "How many Stealth Wards from your trinket can be on the map at once?",
          o: ["3", "1", "2", "4"],
          e: "Three per player, and the oldest one dies the moment you place a fourth." },
        { c: "MECHANICS", t: 2, q: "How long does a Control Ward last after it is placed?",
          o: ["It has no timer - it stays until something destroys it", "90 seconds", "2 minutes 30 seconds", "3 minutes"],
          e: "Control Wards never expire, so an uncontested one denies vision for the rest of the game." },
        { c: "MECHANICS", t: 2, q: "What does Grievous Wounds do?",
          o: ["Reduces all healing and regeneration on the target for a few seconds", "Removes any shield on the target", "Blocks the next heal on the target entirely", "Reduces healing on the target for the rest of the game"],
          e: "It is a temporary healing cut, so it has to be applied during the fight - buying it after the fight is worthless." },
        { c: "MECHANICS", t: 2, q: "What makes an enemy turret switch its target onto you?",
          o: ["Damaging an enemy champion inside the range of the turret", "Walking into the range of the turret", "Attacking a minion inside the range of the turret", "Casting any ability nearby"],
          e: "The turret swaps to you the moment you damage a champion in its zone, which is the whole timing problem in a dive." },
        { c: "MECHANICS", t: 3, q: "Why does attack speed matter more than raw AD on an on-hit champion?",
          o: ["On-hit effects trigger once per basic attack, so more attacks means more procs", "Attack speed also increases critical strike chance", "Attack damage does nothing at all for on-hit builds", "Attack speed lowers the cost of on-hit items"],
          e: "On-hit damage is paid per swing, so the stat that adds swings scales it harder than the stat that adds damage." },

        // -- META -----------------------------------------------------
        { c: "META", t: 1, q: "What is a powerspike?",
          o: ["A moment - a level or a finished item - where your champion suddenly gets much stronger", "The highest damage number you deal in a fight", "The point where a champion stops scaling", "The moment a jungler finishes their first clear"],
          e: "A powerspike is a window, not a stat: you are stronger than the enemy right now and it will not last." },
        { c: "META", t: 1, q: "Which level do most champions treat as their biggest early powerspike?",
          o: ["Level 6", "Level 3", "Level 5", "Level 9"],
          e: "Level six unlocks the ultimate, which is why so many ganks and all-ins are timed to it." },
        { c: "META", t: 2, q: "You complete a large item and your opponent has not. What should that change?",
          o: ["You have a window - look to fight or force pressure before they finish theirs", "Nothing, item spikes only matter in teamfights", "You should back off and farm until they catch up", "You should sell your smaller components"],
          e: "An item lead is a timer, and playing safe through your own spike is the same as never having it." },
        { c: "META", t: 2, q: "Your matchup is genuinely unplayable this game. What is the correct default?",
          o: ["Concede some CS, farm safely and let the lane pull pressure off your team", "Keep trading until you prove the matchup is even", "Abandon the lane and roam permanently", "Build full damage and hunt a solo kill"],
          e: "Unplayable means the right play is to lose the lane slowly and cheaply, not to gamble your way out of it." },
        { c: "META", t: 2, q: "What is a freeze meant to achieve?",
          o: ["Holding the wave near your turret so the enemy has to over-extend to farm", "Crashing the wave so you can recall for free", "Stopping minions dying so the wave grows forever", "Denying the enemy jungler vision of the lane"],
          e: "A freeze turns farming into a risk for your opponent and turns their CS into a gank setup for your jungler." },
        { c: "META", t: 2, q: "What is a slow push for?",
          o: ["Building a large wave that crashes later, buying you time for an objective or a reset", "Keeping the wave still in the middle of the lane", "Making the enemy turret take less damage", "Farming a wave without pushing at all"],
          e: "A slow push converts patience now into a big crash later - the wave does the pressure so you do not have to." },
        { c: "META", t: 2, q: "Why do teams shove the mid wave in before starting Baron?",
          o: ["So the enemy cannot use that wave to counter-push or defend while your team is committed to the pit", "It makes Baron take less time to kill", "It hides the pit from enemy vision", "It gives the mid laner an extra level"],
          e: "Baron is a five-man commitment, and a mid wave you left alive is the free answer the enemy gets to it." },
        { c: "META", t: 2, q: "How far ahead of a major objective should a team set vision up?",
          o: ["About 30 to 60 seconds before it spawns", "Right as it spawns", "Two to three minutes before", "Only once the enemy shows on the map"],
          e: "Vision placed as the objective spawns is already late - the fight for the pit starts before the timer hits zero." },
        { c: "META", t: 2, q: "What does a shutdown bounty do for the team that is behind?",
          o: ["It lets them turn one good pick into a large gold swing", "It removes items from the enemy champion", "It only affects the end-of-game scoreboard", "It doubles their own kill gold for a minute"],
          e: "Bounties are the comeback mechanic: one clean pick on a fed carry can undo several minutes of losing." },
        { c: "META", t: 2, q: "Your composition is the scaling one. What is the right answer to a coinflip 5v5 at twelve minutes?",
          o: ["Avoid it - trade the objective for time and fight later on your terms", "Always take it, fights are how you get gold", "Take it only if you have vision of the Baron pit", "Split into three groups and force separate fights"],
          e: "A scaling team wins by making the game long, so an even fight early is a fight you are choosing to lose." },
        { c: "META", t: 2, q: "Why is recalling while a large wave crashes into the enemy turret good?",
          o: ["The turret eats the minions, so you lose almost no CS and return with items first", "The enemy turret takes extra damage while you are gone", "The wave will freeze in place while you are away", "Your recall channel becomes faster"],
          e: "Recalling on a crash is free time: the wave is dying to the turret anyway, so nobody is farming it." },
        { c: "META", t: 3, q: "What does it mean to have tempo?",
          o: ["You can act on the map before the enemy is able to respond", "You have more gold than the enemy team", "Your team has a higher vision score", "Your champion has short cooldowns"],
          e: "Tempo is time, not gold: a reset, a crashed wave or a fast clear all buy you an action the enemy cannot answer." },
    ];

    // -- Difficulty configuration --------------------------------------
    // read = the question sits on screen ALONE, with no options and no answer
    //        clock running. Skippable with Space or the Show Answers button,
    //        so a fast reader is never held up and a slow one is never rushed.
    // qms  = the answer window, which only starts once the options appear.
    //        Reading time is no longer taken out of thinking time.
    const CONFIG = {
        1: { n: 10, read: 4500, qms: 8000, fb: 1000, session: 140000, name: 'Basic Drill' },
        2: { n: 12, read: 3800, qms: 6500, fb: 900,  session: 140000, name: 'Advanced' },
        3: { n: 14, read: 3200, qms: 5000, fb: 800,  session: 140000, name: 'Elite' },
    };
    $: diffLevel = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 1)));
    $: cfg = CONFIG[diffLevel];

    // -- Round state ---------------------------------------------------
    let phase = 'intro';          // 'intro' | 'play' | 'result'
    let qs = [];
    let idx = 0;
    let picked = -1;
    let revealed = false;
    let reading = false;          // question on screen, options still hidden
    let readEnd = 0;
    let readMs = 0;

    let correct = 0;
    let answeredWrong = 0;
    let timedOut = 0;
    let streak = 0;
    let bestStreak = 0;
    let marks = [];
    let missed = [];
    let catStats = {};
    let answerTimes = [];

    let planned = 0;
    let qMs = 0;
    let fbMs = 0;
    let sessionMs = 0;

    let nowMs = 0;
    let qStart = 0;
    let qEnd = 0;
    let feedbackUntil = 0;
    let sessionEnd = 0;

    let score01 = 0;
    let verdict = { label: '', line: '' };
    let endReason = 'done';

    let rafId = null;
    let reduceMotion = false;
    let mq = null;

    function clock() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    // -- Helpers -------------------------------------------------------
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function prepare(q) {
        const opts = shuffle(q.o.map(function (text, i) {
            return { text: text, correct: i === 0 };
        }));
        return { c: q.c, t: q.t, q: q.q, e: q.e, opts: opts };
    }

    // Draw n questions spread evenly over the five categories, biased
    // toward questions whose depth tier matches the chosen difficulty.
    function buildRound(n, lvl) {
        const per = Math.floor(n / CATS.length);
        const extra = n - per * CATS.length;
        const order = shuffle(CATS.map(function (c) { return c.id; }));
        let out = [];
        order.forEach(function (id, i) {
            const want = per + (i < extra ? 1 : 0);
            const pool = BANK.filter(function (q) { return q.c === id; });
            const scored = pool.map(function (q) {
                return { q: q, w: Math.abs(q.t - lvl) * 0.55 + Math.random() };
            });
            scored.sort(function (a, b) { return a.w - b.w; });
            out = out.concat(scored.slice(0, want).map(function (s) { return s.q; }));
        });
        return shuffle(out).map(prepare);
    }

    function verdictFor(s) {
        if (s >= 0.92) return { label: 'Encyclopedic', line: 'Nothing left to teach you here - that is coach-level recall.' };
        if (s >= 0.80) return { label: 'Sharp Recall', line: 'The numbers are automatic. Now shave the reaction time down.' };
        if (s >= 0.65) return { label: 'Solid Theory', line: 'Good base. Your gaps are the ones you had to stop and think about.' };
        if (s >= 0.48) return { label: 'Serviceable', line: 'You know the game - you do not yet know it fast enough.' };
        if (s >= 0.30) return { label: 'Patchy', line: 'Too much of that was guesswork. Read the explanations before the next rep.' };
        return { label: 'Guesswork', line: 'That was closer to a coin flip than a theory session.' };
    }

    // -- Loop ----------------------------------------------------------
    function stopLoop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function frame() {
        rafId = null;
        if (phase !== 'play') return;
        nowMs = clock();
        if (nowMs >= sessionEnd) { finish('time'); return; }
        if (revealed) {
            if (nowMs >= feedbackUntil) advance();
        } else if (reading) {
            if (nowMs >= readEnd) beginAnswer();
        } else if (nowMs >= qEnd) {
            resolve(-1, true);
        }
        if (phase === 'play') rafId = requestAnimationFrame(frame);
    }

    function startLoop() {
        stopLoop();
        rafId = requestAnimationFrame(frame);
    }

    // -- Flow ----------------------------------------------------------
    function start() {
        planned = cfg.n;
        qMs = cfg.qms;
        readMs = cfg.read;
        fbMs = cfg.fb;
        sessionMs = cfg.session;

        qs = buildRound(planned, diffLevel);
        planned = qs.length;
        idx = 0;
        picked = -1;
        revealed = false;
        correct = 0;
        answeredWrong = 0;
        timedOut = 0;
        streak = 0;
        bestStreak = 0;
        marks = new Array(planned).fill('');
        missed = [];
        answerTimes = [];
        catStats = CATS.reduce(function (m, c) { m[c.id] = { a: 0, c: 0 }; return m; }, {});
        score01 = 0;
        endReason = 'done';

        nowMs = clock();
        sessionEnd = nowMs + sessionMs;
        phase = 'play';
        beginRead();
        startLoop();
    }

    // Every question opens on its own, with the options withheld. The answer
    // clock does not start until beginAnswer(), so time spent reading is never
    // charged against time spent thinking.
    function beginRead() {
        reading = true;
        revealed = false;
        picked = -1;
        nowMs = clock();
        readEnd = nowMs + readMs;
        qStart = nowMs;
        qEnd = nowMs + readMs + qMs;
    }

    function beginAnswer() {
        if (phase !== 'play' || !reading) return;
        reading = false;
        nowMs = clock();
        qStart = nowMs;
        qEnd = nowMs + qMs;
    }

    function resolve(optIdx, byTimeout) {
        if (phase !== 'play' || revealed || reading) return;
        const q = qs[idx];
        if (!q) { finish('done'); return; }
        const t = clock();
        nowMs = t;
        const stat = catStats[q.c];
        if (stat) stat.a += 1;

        picked = optIdx;
        revealed = true;

        const hit = optIdx >= 0 && q.opts[optIdx] && q.opts[optIdx].correct;
        if (hit) {
            correct += 1;
            streak += 1;
            if (streak > bestStreak) bestStreak = streak;
            if (stat) stat.c += 1;
            marks[idx] = 'ok';
            answerTimes.push(Math.max(0, t - qStart));
        } else {
            streak = 0;
            if (byTimeout) {
                timedOut += 1;
                marks[idx] = 'to';
            } else {
                answeredWrong += 1;
                marks[idx] = 'no';
                answerTimes.push(Math.max(0, t - qStart));
            }
            const right = q.opts.find(function (o) { return o.correct; });
            missed.push({ q: q.q, a: right ? right.text : '', c: q.c });
        }
        marks = marks;
        catStats = catStats;
        feedbackUntil = t + fbMs;
    }

    function advance() {
        if (phase !== 'play') return;
        if (idx + 1 >= qs.length) { finish('done'); return; }
        idx += 1;
        beginRead();
    }

    function skipFeedback() {
        if (phase !== 'play' || !revealed) return;
        advance();
    }

    function finish(reason) {
        if (phase !== 'play') return;
        endReason = reason || 'done';
        stopLoop();

        const total = planned > 0 ? planned : 1;
        const acc = correct / total;
        // Subtract a guess floor so a random clicker cannot bank the 25%
        // that four options hand out for free, then curve it slightly so
        // "most of them right" is clearly worth less than "nearly all".
        const base = Math.max(0, Math.min(1, (acc - 0.15) / 0.85));
        const adj = Math.pow(base, 1.25);
        const streakRatio = Math.max(0, Math.min(1, bestStreak / total));
        const raw = adj * 0.86 + streakRatio * 0.14;
        score01 = Math.max(0, Math.min(1, Math.round(raw * 1000) / 1000));
        verdict = verdictFor(score01);
        phase = 'result';
    }

    function handleFinish() {
        const total = planned > 0 ? planned : 1;
        const asked = correct + answeredWrong + timedOut;
        const avgMs = answerTimes.length
            ? answerTimes.reduce(function (s, v) { return s + v; }, 0) / answerTimes.length
            : 0;
        const meta = {
            label: verdict.label,
            accuracy: Math.round((correct / total) * 1000) / 1000,
            hits: correct,
            misses: total - correct,
            streak: bestStreak,
            best: bestStreak,
            detail: correct + '/' + total + ' correct - ' + Math.round((correct / total) * 100)
                + '% accuracy - best streak ' + bestStreak + ' - ' + (avgMs / 1000).toFixed(1) + 's average answer',
            asked: asked,
            unasked: total - asked,
            timedOut: timedOut,
            wrong: answeredWrong,
            avgAnswerMs: Math.round(avgMs),
            difficulty: diffLevel,
            ranOutOfTime: endReason === 'time',
            categories: CATS.map(function (c) {
                return {
                    id: c.id,
                    asked: catStats[c.id] ? catStats[c.id].a : 0,
                    correct: catStats[c.id] ? catStats[c.id].c : 0,
                };
            }),
        };
        if (typeof onComplete === 'function') onComplete(score01, meta);
    }

    function handleQuit() {
        if (typeof onQuit === 'function') onQuit();
    }

    // -- Keyboard ------------------------------------------------------
    function handleKey(e) {
        if (phase !== 'play') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        let n = -1;
        if (e.key >= '1' && e.key <= '4') n = Number(e.key) - 1;
        else if (e.code && /^Numpad[1-4]$/.test(e.code)) n = Number(e.code.slice(6)) - 1;

        if (n >= 0) {
            if (!revealed && !reading) { e.preventDefault(); resolve(n, false); }
            return;
        }
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
            if (reading) { e.preventDefault(); beginAnswer(); }
            else if (revealed) { e.preventDefault(); skipFeedback(); }
        }
    }

    // -- Lifecycle -----------------------------------------------------
    function onMotionChange(e) { reduceMotion = !!e.matches; }

    onMount(function () {
        if (typeof window !== 'undefined' && window.matchMedia) {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            reduceMotion = !!mq.matches;
            if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
            else if (mq.addListener) mq.addListener(onMotionChange);
        }
    });

    onDestroy(function () {
        stopLoop();
        if (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMotionChange);
            else if (mq.removeListener) mq.removeListener(onMotionChange);
            mq = null;
        }
    });

    // -- Derived view state --------------------------------------------
    $: current = (phase === 'play' && qs[idx]) ? qs[idx] : null;
    $: currentCat = current ? (CAT_BY_ID[current.c] || CATS[0]) : CATS[0];
    $: qPct = (phase === 'play' && !revealed && !reading && qMs > 0)
        ? Math.max(0, Math.min(1, (qEnd - nowMs) / qMs))
        : ((revealed || reading) ? 1 : 0);
    $: readPct = (phase === 'play' && reading && readMs > 0)
        ? Math.max(0, Math.min(1, (readEnd - nowMs) / readMs))
        : 0;
    $: sessionLeft = phase === 'play' ? Math.max(0, sessionEnd - nowMs) : 0;
    $: sessionPct = (phase === 'play' && sessionMs > 0)
        ? Math.max(0, Math.min(1, sessionLeft / sessionMs)) : 0;
    $: lowTime = phase === 'play' && !revealed && !reading && qPct <= 0.28;
    $: accPct = planned > 0 ? Math.round((correct / planned) * 100) : 0;
    $: avgAnswer = answerTimes.length
        ? (answerTimes.reduce(function (s, v) { return s + v; }, 0) / answerTimes.length / 1000)
        : 0;
    $: scoreOut = Math.round(score01 * 100);
    $: title = (drill && drill.name) ? drill.name : 'Theory Session';
    $: blurb = (drill && drill.desc)
        ? drill.desc
        : 'Patch literacy, item math, powerspikes, and what the meta is about to become.';
    $: qSeconds = (cfg.qms / 1000).toFixed(cfg.qms % 1000 ? 1 : 0);
</script>

<svelte:window on:keydown={handleKey} />

<section class="tg" class:reduced={reduceMotion} style="--accent:{ACCENT}">

    <!-- ============== INTRO ============== -->
    {#if phase === 'intro'}
        <div class="card">
            <div class="head">
                <span class="ico" aria-hidden="true">{ICON}</span>
                <div class="head-txt">
                    <div class="kicker">Game Knowledge Drill</div>
                    <h2 class="title">{title}</h2>
                </div>
                <span class="difftag">{cfg.name}</span>
            </div>

            <p class="lede">{blurb}</p>
            <p class="body">
                Game knowledge is not a feel, it is a lookup table. Objective timers, item components,
                gold values and the handful of rules that decide whether your math in a 2v2 is right.
                Nobody calculates any of it mid-fight - they memorised it years ago. This drill hammers
                that recall until the answer arrives before you have finished reading the question.
            </p>

            <div class="label">How to play</div>
            <ul class="how">
                <li><span class="bullet"></span>{cfg.n} questions, four answers, exactly one correct.</li>
                <li><span class="bullet"></span>Press <b>1</b>-<b>4</b> or click an answer. Wrong and out-of-time both count as a miss.</li>
                <li><span class="bullet"></span><b>{qSeconds}s</b> per question and <b>{cfg.session / 1000}s</b> for the whole session - questions you never reach still count against you.</li>
                <li><span class="bullet"></span>Consecutive correct answers build a streak, and your best streak adds a bonus.</li>
                <li><span class="bullet"></span>Every answer is explained. Press <b>Space</b> to move on early.</li>
            </ul>

            <div class="label">Topics</div>
            <div class="cats">
                {#each CATS as c}
                    <span class="cat" style="--c:{c.color}">{c.label}</span>
                {/each}
            </div>

            <div class="actions">
                <button class="btn back" type="button" on:click={handleQuit}
                    aria-label="Back out of this drill without training">Back</button>
                <button class="btn go" type="button" on:click={start}
                    aria-label="Start the theory session">Start Session</button>
            </div>
        </div>

    <!-- ============== PLAYING ============== -->
    {:else if phase === 'play'}
        <div class="card">
            <div class="hud">
                <div class="hud-l">
                    <span class="cat" style="--c:{currentCat.color}">{currentCat.label}</span>
                    <span class="counter">{Math.min(idx + 1, planned)}<span class="of">/{planned}</span></span>
                </div>
                <div class="hud-r">
                    <span class="pill ok" aria-label="Correct answers so far">{correct} correct</span>
                    <span class="pill streak" class:hot={streak >= 3} aria-label="Current answer streak">x{streak}</span>
                    <span class="pill time" class:warn={sessionPct <= 0.25} aria-label="Seconds left in the session">{Math.ceil(sessionLeft / 1000)}s</span>
                </div>
            </div>

            <div class="sbar" aria-hidden="true">
                <div class="sbar-fill" style="width:{sessionPct * 100}%"></div>
            </div>

            <div class="dots" aria-hidden="true">
                {#each marks as m, i}
                    <span class="dot {m}" class:now={i === idx}></span>
                {/each}
            </div>

            {#if current}
                <p class="question">{current.q}</p>

                <div class="qbar" aria-hidden="true">
                    <div
                        class="qbar-fill"
                        style="width:{(reading ? readPct : qPct) * 100}%; background:{reading ? '#64748b' : (revealed ? 'rgba(148,163,184,0.25)' : (lowTime ? '#ef4444' : ACCENT))}"
                    ></div>
                </div>
                <div class="lowtxt" aria-hidden="true">{lowTime ? 'Out of time in a moment' : ''}</div>

                {#if reading}
                    <!-- Read phase: the question stands alone. No options to
                         skim ahead to, and no answer clock running yet. -->
                    <div class="reading">
                        <p class="read-lbl">Read the question</p>
                        <button class="read-go" type="button" on:click={beginAnswer}>
                            Show Answers
                            <span class="read-kbd">Space</span>
                        </button>
                        <p class="read-note">Answers appear in {Math.ceil((readEnd - nowMs) / 1000)}s &mdash; the clock starts then.</p>
                    </div>
                {:else}
                    <div class="opts">
                        {#each current.opts as opt, i (i)}
                            <button
                                type="button"
                                class="opt"
                                class:right={revealed && opt.correct}
                                class:wrong={revealed && picked === i && !opt.correct}
                                class:fade={revealed && !opt.correct && picked !== i}
                                class:shake={revealed && picked === i && !opt.correct && !reduceMotion}
                                disabled={revealed}
                                on:click={() => resolve(i, false)}
                                aria-label={'Answer ' + (i + 1) + ': ' + opt.text}
                            >
                                <span class="key" aria-hidden="true">{i + 1}</span>
                                <span class="otxt">{opt.text}</span>
                                {#if revealed && opt.correct}<span class="tick" aria-hidden="true">OK</span>{/if}
                                {#if revealed && picked === i && !opt.correct}<span class="cross" aria-hidden="true">X</span>{/if}
                            </button>
                        {/each}
                    </div>
                {/if}

                <div class="fb" aria-live="polite">
                    {#if reading}
                        <div class="fb-hint">Take your time. Nothing is being timed yet.</div>
                    {:else if revealed}
                        <div class="fb-in">
                            <span class="fb-tag" class:bad={picked < 0 || !current.opts[picked] || !current.opts[picked].correct}>
                                {picked < 0 ? 'Out of time' : ((current.opts[picked] && current.opts[picked].correct) ? 'Correct' : 'Wrong')}
                            </span>
                            <span class="fb-txt">{current.e}</span>
                        </div>
                    {:else}
                        <div class="fb-hint">Press 1-4 or click an answer.</div>
                    {/if}
                </div>

                <div class="nextrow">
                    <button
                        class="btn next"
                        type="button"
                        disabled={!revealed}
                        on:click={skipFeedback}
                        aria-label="Go to the next question"
                    >{idx + 1 >= planned ? 'Finish' : 'Next'} <span class="nkey">Space</span></button>
                </div>
            {/if}
        </div>

    <!-- ============== RESULT ============== -->
    {:else}
        <div class="card">
            <div class="head">
                <span class="ico" aria-hidden="true">{ICON}</span>
                <div class="head-txt">
                    <div class="kicker">Session Complete</div>
                    <h2 class="title">{title}</h2>
                </div>
                <span class="difftag">{cfg.name}</span>
            </div>

            <div class="scorebox">
                <div class="scoreval" aria-label={'Score ' + scoreOut + ' out of 100'}>{scoreOut}</div>
                <div class="scoremeta">
                    <div class="scorelabel">{verdict.label}</div>
                    <div class="scoreline">{verdict.line}</div>
                </div>
            </div>

            <div class="statgrid">
                <div class="stat"><span class="sv">{correct}/{planned}</span><span class="sl">Correct</span></div>
                <div class="stat"><span class="sv">{accPct}%</span><span class="sl">Accuracy</span></div>
                <div class="stat"><span class="sv">{bestStreak}</span><span class="sl">Best Streak</span></div>
                <div class="stat"><span class="sv">{avgAnswer.toFixed(1)}s</span><span class="sl">Avg Answer</span></div>
                <div class="stat"><span class="sv">{timedOut}</span><span class="sl">Timed Out</span></div>
                <div class="stat"><span class="sv">{planned - correct - answeredWrong - timedOut}</span><span class="sl">Not Reached</span></div>
            </div>

            {#if endReason === 'time'}
                <p class="note">The session clock ran out before the last questions. Anything you never reached counts as a miss - the drill rewards answering faster, not only answering better.</p>
            {/if}

            <div class="label">By topic</div>
            <div class="catrows">
                {#each CATS as c}
                    {#if catStats[c.id] && catStats[c.id].a > 0}
                        <div class="catrow">
                            <span class="cat small" style="--c:{c.color}">{c.label}</span>
                            <div class="catbar">
                                <div class="catbar-fill" style="width:{(catStats[c.id].c / catStats[c.id].a) * 100}%; background:{c.color}"></div>
                            </div>
                            <span class="catnum">{catStats[c.id].c}/{catStats[c.id].a}</span>
                        </div>
                    {/if}
                {/each}
            </div>

            {#if missed.length}
                <div class="label">Review</div>
                <ul class="review">
                    {#each missed.slice(0, 4) as m}
                        <li>
                            <span class="rq">{m.q}</span>
                            <span class="ra">{m.a}</span>
                        </li>
                    {/each}
                </ul>
                {#if missed.length > 4}
                    <div class="more">+{missed.length - 4} more missed</div>
                {/if}
            {/if}

            <div class="actions">
                <button class="btn go" type="button" on:click={handleFinish}
                    aria-label="Finish the session and bank the result">Finish Session</button>
            </div>
        </div>
    {/if}
</section>

<style>
    .tg {
        --panel: rgba(12, 16, 28, 0.5);
        --line: rgba(148, 163, 184, 0.15);
        width: 100%;
        max-width: 720px;
        margin: 0 auto;
        color: #cbd5e1;
        font-size: 13px;
    }

    .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 16px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }
    @media (min-width: 560px) { .card { padding: 22px; } }

    /* -- Header ----------------------------------------------- */
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .ico {
        width: 38px; height: 38px; flex: 0 0 38px;
        border-radius: 12px;
        background: rgba(148, 163, 184, 0.10);
        border: 1px solid rgba(148, 163, 184, 0.18);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; line-height: 1;
    }
    .head-txt { flex: 1; min-width: 0; }
    .kicker {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #475569;
    }
    .title {
        font-size: 18px; font-weight: 900; color: #e2e8f0;
        margin: 2px 0 0; line-height: 1.15;
    }
    .difftag {
        flex: 0 0 auto;
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px;
        color: var(--accent);
        background: rgba(148, 163, 184, 0.10);
        border: 1px solid rgba(148, 163, 184, 0.20);
        border-radius: 999px; padding: 5px 9px;
    }

    .lede { font-size: 12px; color: #94a3b8; line-height: 1.55; margin: 0 0 10px; }
    .body { font-size: 12.5px; color: #64748b; line-height: 1.65; margin: 0 0 4px; }

    .label {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #334155; margin: 16px 0 8px;
    }

    .how { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
    .how li {
        position: relative; padding-left: 16px;
        font-size: 12px; color: #94a3b8; line-height: 1.5;
    }
    .how b { color: #e2e8f0; font-weight: 800; }
    .bullet {
        position: absolute; left: 0; top: 7px;
        width: 6px; height: 6px; border-radius: 2px;
        background: var(--accent); opacity: 0.65;
    }

    .cats { display: flex; flex-wrap: wrap; gap: 6px; }
    .cat {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px;
        color: var(--c, #94a3b8);
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid currentColor;
        border-radius: 999px; padding: 4px 9px; white-space: nowrap;
        opacity: 0.95;
    }
    .cat.small { font-size: 8.5px; padding: 3px 7px; flex: 0 0 76px; text-align: center; }

    /* -- Buttons ---------------------------------------------- */
    .actions { display: flex; gap: 10px; margin-top: 18px; }
    .btn {
        font-family: inherit;
        font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        border-radius: 12px; padding: 12px 18px;
        cursor: pointer; touch-action: manipulation;
        transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .back {
        background: rgba(51, 65, 85, 0.5); color: #94a3b8;
        border: 1px solid rgba(71, 85, 105, 0.4);
    }
    .back:hover { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .go {
        flex: 1;
        background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%);
        color: #0b1120; border: none;
        box-shadow: 0 4px 15px rgba(148, 163, 184, 0.18);
    }
    .go:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(148, 163, 184, 0.3); }

    /* -- HUD -------------------------------------------------- */
    .hud { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .hud-l, .hud-r { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .counter { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .of { font-size: 10px; color: #475569; font-weight: 800; }
    .pill {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        border-radius: 999px; padding: 4px 8px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.4);
        color: #64748b; white-space: nowrap;
    }
    .pill.ok { color: #4ade80; border-color: rgba(34, 197, 94, 0.22); }
    .pill.streak.hot { color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); }
    .pill.time.warn { color: #f87171; border-color: rgba(239, 68, 68, 0.3); }

    .sbar {
        height: 4px; border-radius: 999px; overflow: hidden;
        background: rgba(15, 23, 42, 0.8); margin: 10px 0 8px;
    }
    .sbar-fill { height: 100%; background: rgba(148, 163, 184, 0.55); border-radius: 999px; }

    .dots { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 3px; background: rgba(51, 65, 85, 0.5); }
    .dot.ok { background: #22c55e; }
    .dot.no { background: #ef4444; }
    .dot.to { background: #92400e; }
    .dot.now { box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.35); }

    /* -- Question --------------------------------------------- */
    .question {
        font-size: 15px; font-weight: 800; color: #e2e8f0;
        line-height: 1.4; margin: 0 0 12px; min-height: 63px;
    }
    @media (min-width: 560px) { .question { font-size: 17px; min-height: 72px; } }

    .qbar {
        height: 5px; border-radius: 999px; overflow: hidden;
        background: rgba(15, 23, 42, 0.8);
    }
    .qbar-fill { height: 100%; border-radius: 999px; }
    .lowtxt {
        font-size: 8.5px; font-weight: 900; letter-spacing: 1.5px; min-height: 12px;
        text-transform: uppercase; color: #f87171; text-align: right; padding-top: 2px;
    }

    /* ---- read phase --------------------------------------------------
       Occupies roughly the space the options will take, so revealing them
       does not make the whole card jump. */
    .reading {
        margin-top: 6px;
        min-height: 168px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 12px;
        border-radius: 14px;
        background: rgba(12, 16, 28, 0.4);
        border: 1px dashed rgba(71, 85, 105, 0.32);
        padding: 18px 16px;
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
    .read-note { font-size: 10.5px; color: #475569; font-weight: 600; }

    .opts { display: grid; gap: 7px; margin-top: 6px; }
    .opt {
        display: flex; align-items: center; gap: 10px; width: 100%;
        text-align: left; font-family: inherit;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.45);
        border-radius: 12px; padding: 11px 12px;
        color: #cbd5e1; font-size: 12.5px; line-height: 1.35; font-weight: 600;
        cursor: pointer; touch-action: manipulation;
        transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
    }
    .opt:hover:not(:disabled) {
        border-color: rgba(148, 163, 184, 0.5);
        background: rgba(30, 41, 59, 0.6);
        color: #e2e8f0;
    }
    .opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .opt:disabled { cursor: default; }
    .key {
        flex: 0 0 20px; width: 20px; height: 20px; border-radius: 6px;
        background: rgba(51, 65, 85, 0.5); color: #94a3b8;
        font-size: 10px; font-weight: 900;
        display: flex; align-items: center; justify-content: center;
    }
    .otxt { flex: 1; min-width: 0; }
    .tick, .cross { flex: 0 0 auto; font-size: 9px; font-weight: 900; letter-spacing: 1px; }
    .tick { color: #4ade80; }
    .cross { color: #f87171; }

    .opt.right {
        border-color: rgba(34, 197, 94, 0.55);
        background: rgba(34, 197, 94, 0.12);
        color: #bbf7d0;
    }
    .opt.right .key { background: rgba(34, 197, 94, 0.25); color: #bbf7d0; }
    .opt.wrong {
        border-color: rgba(239, 68, 68, 0.5);
        background: rgba(239, 68, 68, 0.10);
        color: #fecaca;
    }
    .opt.wrong .key { background: rgba(239, 68, 68, 0.22); color: #fecaca; }
    .opt.fade { opacity: 0.4; }
    .opt.shake { animation: tgShake 0.24s ease; }
    @keyframes tgShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
    }

    /* -- Feedback --------------------------------------------- */
    .fb { min-height: 48px; margin-top: 10px; }
    .fb-in { display: flex; gap: 8px; align-items: flex-start; }
    .fb-tag {
        flex: 0 0 auto;
        font-size: 8.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px;
        color: #4ade80; background: rgba(34, 197, 94, 0.12);
        border: 1px solid rgba(34, 197, 94, 0.25);
        border-radius: 999px; padding: 4px 8px; margin-top: 1px;
    }
    .fb-tag.bad { color: #f87171; background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.25); }
    .fb-txt { font-size: 11.5px; color: #94a3b8; line-height: 1.5; }
    .fb-hint { font-size: 10px; color: #334155; font-weight: 700; letter-spacing: 0.5px; }

    .nextrow { display: flex; justify-content: flex-end; margin-top: 4px; }
    .next {
        background: rgba(51, 65, 85, 0.45); color: #94a3b8;
        border: 1px solid rgba(71, 85, 105, 0.4);
        padding: 9px 14px; font-size: 10px;
        display: inline-flex; align-items: center; gap: 8px;
    }
    .next:hover:not(:disabled) { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .next:disabled { opacity: 0.35; cursor: default; }
    .nkey {
        font-size: 8px; letter-spacing: 1px; color: #475569;
        border: 1px solid rgba(71, 85, 105, 0.5); border-radius: 5px; padding: 2px 5px;
    }

    /* -- Result ----------------------------------------------- */
    .scorebox {
        display: flex; align-items: center; gap: 14px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 16px; padding: 14px; margin-bottom: 12px;
    }
    .scoreval {
        font-size: 42px; font-weight: 900; line-height: 1;
        color: var(--accent); flex: 0 0 auto;
    }
    .scoremeta { min-width: 0; }
    .scorelabel {
        font-size: 13px; font-weight: 900; color: #e2e8f0;
        text-transform: uppercase; letter-spacing: 1px;
    }
    .scoreline { font-size: 11.5px; color: #64748b; line-height: 1.5; margin-top: 3px; }

    .statgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
    @media (max-width: 419px) { .statgrid { grid-template-columns: repeat(2, 1fr); } }
    .stat {
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.25);
        border-radius: 12px; padding: 10px 6px; text-align: center;
    }
    .sv { display: block; font-size: 16px; font-weight: 900; color: #e2e8f0; }
    .sl {
        display: block; font-size: 8px; font-weight: 800; color: #475569;
        text-transform: uppercase; letter-spacing: 1px; margin-top: 3px;
    }

    .note {
        font-size: 11px; color: #94a3b8; line-height: 1.5;
        margin: 12px 0 0; padding: 9px 11px;
        background: rgba(239, 68, 68, 0.06);
        border: 1px solid rgba(239, 68, 68, 0.16);
        border-radius: 10px;
    }

    .catrows { display: grid; gap: 6px; }
    .catrow { display: flex; align-items: center; gap: 8px; }
    .catbar {
        flex: 1; height: 6px; border-radius: 999px; overflow: hidden;
        background: rgba(15, 23, 42, 0.8); min-width: 40px;
    }
    .catbar-fill { height: 100%; border-radius: 999px; }
    .catnum {
        flex: 0 0 auto; font-size: 10px; font-weight: 900;
        color: #64748b; min-width: 30px; text-align: right;
    }

    .review { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .review li {
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.25);
        border-radius: 10px; padding: 9px 11px;
    }
    .rq { display: block; font-size: 11px; color: #94a3b8; line-height: 1.4; }
    .ra { display: block; font-size: 11.5px; font-weight: 800; color: #4ade80; margin-top: 3px; }
    .more { font-size: 10px; color: #334155; font-weight: 700; margin-top: 6px; text-align: center; }

    /* -- Reduced motion --------------------------------------- */
    .tg.reduced .opt.shake { animation: none; }
    .tg.reduced .btn:hover { transform: none; }
    @media (prefers-reduced-motion: reduce) {
        .opt.shake { animation: none; }
        .btn, .opt { transition: none; }
        .btn:hover { transform: none; }
    }
</style>
