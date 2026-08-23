<script>
    // ===================================================================
    //  COMMS CHECK  -  Shotcalling drill (attr 'ldr')
    //  Rapid-fire macro scenarios on a clock. Read the state, make the
    //  call, get told why it was right or wrong. Self-contained: no store
    //  imports, no career imports, four props and nothing else.
    // ===================================================================
    import { onMount, onDestroy, tick } from 'svelte';

    export let difficulty = 1;      // 1 Basic, 2 Advanced, 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    // Accent for this attribute (LDR) is #ec4899 - see --acc in the style block.
    const ICON = '\u{1F5E3}';

    // -- Difficulty table ------------------------------------------------
    //  reps   scenarios in the round
    //  limit  per-scenario decision window (ms)
    //  reveal auto-advance on the explanation (ms) - skippable
    //  expo   demand curve. Higher = the same raw play scores lower.
    const CFG = {
        1: { reps: 10, limit: 9000, reveal: 2200, expo: 0.90, name: 'Basic Drill' },
        2: { reps: 11, limit: 7500, reveal: 1900, expo: 1.22, name: 'Advanced' },
        3: { reps: 12, limit: 6000, reveal: 1700, expo: 1.55, name: 'Elite' },
    };

    $: dlvl = Math.max(1, Math.min(3, Math.round(Number(difficulty)) || 1));
    $: dcfg = CFG[dlvl];

    // -- Scenario bank ---------------------------------------------------
    //  Exactly one option per scenario carries credit 1 (the call), one
    //  carries 0.45 (the runner-up), one 0.05 (defensible but wrong) and
    //  one 0 (the trap). Options are shuffled at runtime so position is
    //  never a tell.
    const SCENARIOS = [
        {
            id: 'baron_window', clock: '24:10', phase: 'Baron window',
            brief: "Baron spawns in forty seconds and three of them are on the floor.",
            state: ["Baron 0:40", "3 enemies dead - 25s timers", "Bot lane one wave behind topside", "Your ADC has no Zhonya"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Rotate topside now, crash the wave and set deep vision around the pit before Baron spawns.", why: "Their timers expire before Baron does, so those twenty-five seconds are worth vision and wave state, not a fight you cannot finish." },
                { tag: 'SAFE', credit: 0.45, text: "Hold mid, clear the wave and only walk to the pit once all five are accounted for.", why: "Not wrong, just slow. You hand back the free setup window you just paid three kills for." },
                { tag: 'GREEDY', credit: 0.05, text: "Force a tower dive top right now while they are dead.", why: "You arrive with no wave, and Baron spawns while you are still on the wrong side of the map." },
                { tag: 'TRAP', credit: 0, text: "Send the ADC alone to collect the topside wave while the rest set up.", why: "A carry with no Zhonya, alone, on the side three people respawn toward. That is how you lose Baron and the ADC." },
            ],
        },
        {
            id: 'soul_point', clock: '21:35', phase: 'Soul point',
            brief: "You are four thousand down and the next drake is their Soul.",
            state: ["Gold: -4.0k", "Soul point drake 1:00", "Their jungler shown top", "Your top has Teleport"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "All five bot now and start the drake while their jungler is stranded on the top side.", why: "Soul decides this game and he cannot cross the map in time. A numbers window beats a gold deficit." },
                { tag: 'SAFE', credit: 0.45, text: "Ward the pit, hold on our side of the river and only commit if they start it low.", why: "Sane, but at four thousand down waiting hands them a clean Soul entirely on their terms." },
                { tag: 'GREEDY', credit: 0.05, text: "Force a 5v5 in their bot jungle before the drake spawns.", why: "Four thousand gold is four thousand gold. An even fight is not even." },
                { tag: 'TRAP', credit: 0, text: "Send top to the side lane for pressure and contest the drake 4v5.", why: "Splitting off a Teleport body to contest the single most important objective of the game is the worst of both plans." },
            ],
        },
        {
            id: 'flash_timer', clock: '12:05', phase: 'Flash timer',
            brief: "You died mid and their mid burned Flash to win the 1v1.",
            state: ["You respawn in 0:15", "Enemy mid Flash down 5:00", "Your jungler bot side, full clear", "Herald 0:30"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Call the Flash with a timer on comms and have the jungler path mid for the next wave.", why: "A five minute Flash on a mid laner is a free kill for whoever wants it. Say it out loud or it never happened." },
                { tag: 'SAFE', credit: 0.45, text: "Jungler takes Herald uncontested while their mid is stuck holding the wave.", why: "Real value, but you let the best window on the map expire while you hit a rock." },
                { tag: 'GREEDY', credit: 0.05, text: "Buy and walk straight back mid to fight him again at even levels.", why: "You do not have Flash either. That is a coin flip you already lost once." },
                { tag: 'TRAP', credit: 0, text: "Ping all five mid for a dive the second you respawn.", why: "No wave, no vision, and two of them are closer to mid than three of you are." },
            ],
        },
        {
            id: 'reset_window', clock: '28:50', phase: 'Reset window',
            brief: "The bot inhibitor is down and two of them are dead on short timers.",
            state: ["Bot inhibitor broken", "2 enemies dead - 20s timers", "Baron 2:10", "ADC 400g from item three"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Reset all five, buy, and walk mid with the super minions doing the pushing for us.", why: "Twenty seconds is not enough to end. Super minions hold the lane for free while you turn gold into items." },
                { tag: 'GREEDY', credit: 0.45, text: "Take the exposed nexus turret before anybody backs.", why: "Tempting and often fine, but you eat the respawn wave for a turret you can have for free in a minute." },
                { tag: 'SAFE', credit: 0.05, text: "Send the ADC topside to farm out the last four hundred gold.", why: "Right idea, wrong body. Your carry is now the furthest thing from your team with Baron two minutes out." },
                { tag: 'TRAP', credit: 0, text: "Chase the three survivors into their jungle to set up Baron.", why: "Chasing into fog next to two respawns from a won position. Nothing on the far side of that is worth it." },
            ],
        },
        {
            id: 'early_path', clock: '03:15', phase: 'Early pathing',
            brief: "Their jungler started top side, so the bot river is empty.",
            state: ["Enemy jungler top side raptors", "Bot scuttle up", "You have bot lane priority", "Enemy bot: both Flashes up"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Bot pushes the wave in and walks down with the jungler to take bot scuttle.", why: "Free vision and a free crab because you know exactly where he is. This is what tracking is for." },
                { tag: 'SAFE', credit: 0.45, text: "Bot shoves and backs early on the crash.", why: "Clean, but you leave a free objective in the river because you were in a hurry to buy." },
                { tag: 'GREEDY', credit: 0.05, text: "Dive bot lane at level three into two Flashes.", why: "Both summoners up under tower is the one dive that never works." },
                { tag: 'TRAP', credit: 0, text: "Send the whole bot lane to invade his top side red buff.", why: "By the time you walk there he has left, and your bot lane is five minutes out of position." },
            ],
        },
        {
            id: 'elder', clock: '31:20', phase: 'Elder',
            brief: "Elder spawns in thirty seconds and they are holding Soul.",
            state: ["Elder 0:30", "They have Soul", "Their support dead 0:45", "Their jungler has no Smite"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Set up on the pit with four warding and start Elder the moment it spawns.", why: "A man up and a Smite up. Elder is the only thing that cancels Soul and you have every advantage needed to take it." },
                { tag: 'GREEDY', credit: 0.45, text: "Force the fight at the pit right now while it is 5v4.", why: "Also strong, but if the fight runs long the Elder spawns into a scrappy 3v3 and anything happens." },
                { tag: 'SAFE', credit: 0.05, text: "Back off, defend base and take the fight when their support is alive.", why: "You are giving away a man advantage into Soul. Fair fights are for teams that are ahead." },
                { tag: 'TRAP', credit: 0, text: "Give Elder and take Baron on the far side of the map.", why: "Elder into Soul ends the game long before your Baron push reaches an inhibitor." },
            ],
        },
        {
            id: 'herald_tp', clock: '15:40', phase: 'Herald',
            brief: "Your top wave is slow pushing and their top just teleported bot.",
            state: ["Herald in your pocket", "Enemy top used TP bot", "Top wave slow pushing in", "Their jungler last seen bot river"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Crash the top wave and drop Herald on the top tower while their top is on the other side of the map.", why: "A Teleport is ten seconds of an empty lane. Convert it into a structure, not into a coin flip." },
                { tag: 'SAFE', credit: 0.45, text: "Hold Herald, take the top wave, then use it mid after the next crash.", why: "Fine value, but you pay for the delay with the one window where the lane is genuinely empty." },
                { tag: 'GREEDY', credit: 0.05, text: "Send four bot to collapse on the Teleport with the top wave still uncrashed.", why: "You are fighting a five man group that chose the fight, and your top wave dies into the tower for nothing." },
                { tag: 'TRAP', credit: 0, text: "Give up Herald, all five bot, and take the 5v5 with our top still walking.", why: "Starting a 4v5 on their terms and letting Herald expire is two mistakes inside one call." },
            ],
        },
        {
            id: 'baron_vision', clock: '26:00', phase: 'Baron vision',
            brief: "Baron is up and nobody has seen their jungler for a while.",
            state: ["Baron up", "Enemy jungler unseen 0:35", "No river vision", "Support on a 1200g back"],
            options: [
                { tag: 'SAFE', credit: 1, text: "Nobody touches Baron. Support resets, we clear the mid wave and rebuild river vision as a group.", why: "Baron without vision is a donation. Buy the wards first, then buy the objective." },
                { tag: 'TEMPO', credit: 0.45, text: "Sweep in with four, ward the pit and only start once we actually see him.", why: "Reasonable, but you are doing it a man down and with a support who cannot afford the wards." },
                { tag: 'GREEDY', credit: 0.05, text: "Start Baron now while they are all missing and Smite it out fast.", why: "All missing is not all elsewhere. That is the exact setup they are hoping you read as free." },
                { tag: 'TRAP', credit: 0, text: "Send the support in alone to deep ward their jungle.", why: "You just donated the one person who was going to give you vision, plus the shutdown that comes with them." },
            ],
        },
        {
            id: 'base_race', clock: '33:05', phase: 'Base race',
            brief: "They are hitting your bot inhibitor while you sit on their nexus turrets.",
            state: ["Four of you at their nexus turrets", "Full super wave with you", "Their five on your bot inhib", "Nobody has Teleport"],
            options: [
                { tag: 'GREEDY', credit: 1, text: "Commit. We are a full structure ahead in the race and the super minions finish the job.", why: "Races are arithmetic. You are ahead on the count and you have the wave, so turning around loses both ends of it." },
                { tag: 'SAFE', credit: 0.45, text: "Everyone recalls and we defend the 4v5 under our own nexus turrets.", why: "Survivable, but you throw away a won race to hold a base you might still lose anyway." },
                { tag: 'TEMPO', credit: 0.05, text: "Two go back to defend, two keep hitting.", why: "Half a defence and half a push. You lose the base and the race at the same time." },
                { tag: 'TRAP', credit: 0, text: "Break off and take the drake that just spawned.", why: "There is no version of this where a drake stack matters more than a nexus." },
            ],
        },
        {
            id: 'item_spike', clock: '19:10', phase: 'Item spike',
            brief: "Their carry just spiked two items and yours is nine hundred short.",
            state: ["Enemy ADC: two item spike", "Your ADC 900g from item one", "Gold even", "Drake 1:30"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Push the side waves out, back on the crash and get the item in hand before we walk to the pit.", why: "You cannot un-buy their item. You can arrive at the same fight ninety seconds later holding your own." },
                { tag: 'SAFE', credit: 0.45, text: "Give the drake, take the mid tower and the topside waves instead.", why: "A clean trade, but you concede a stack you may badly want at Soul point for gold you already have." },
                { tag: 'GREEDY', credit: 0.05, text: "Fight at the pit now, before their ADC gets back to lane with it.", why: "The item is already bought. The fight is already worse and starting it early does not change that." },
                { tag: 'TRAP', credit: 0, text: "Force a 5v5 in their jungle and look for a pick.", why: "Hunting picks in their own jungle while behind on items is how nine hundred gold becomes four thousand." },
            ],
        },
        {
            id: 'jgl_track', clock: '10:20', phase: 'Jungle tracking',
            brief: "Their jungler left the bot side forty seconds ago and your mid is overextended.",
            state: ["Jungler last seen bot raptors 0:40", "Your mid shoved to their tower", "Your mid has no Flash", "Top scuttle just spawned"],
            options: [
                { tag: 'SAFE', credit: 1, text: "Mid gives up the last minions and resets the wave; jungle and support take the top scuttle.", why: "Forty seconds from bot raptors puts him mid or top. Take the crab in the half of the map his pathing already left." },
                { tag: 'TEMPO', credit: 0.45, text: "Mid holds the shove but the support walks up and wards the mid river entrance first.", why: "Correct instinct, but the ward arrives at the same moment he does and your mid has no Flash to use it with." },
                { tag: 'GREEDY', credit: 0.05, text: "Mid keeps shoving for the plate and we call it if we see him.", why: "You are asking a flashless laner to win a footrace against information you do not have." },
                { tag: 'TRAP', credit: 0, text: "Send our jungler mid to counter gank with no vision.", why: "Counter ganking blind turns a possible 1v2 into a guaranteed 2v3." },
            ],
        },
        {
            id: 'double_obj', clock: '25:15', phase: 'Double objective',
            brief: "Baron and drake come up together and they all just recalled.",
            state: ["Baron 0:10", "Drake 0:30", "All five of them just recalled", "You are 2k up, all alive"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Start Baron the moment it spawns while they are still walking out of fountain.", why: "A five man back is the cleanest Baron window in the game, and Baron is worth more than the stack." },
                { tag: 'SAFE', credit: 0.45, text: "Take the drake first because it is faster, then reassess Baron.", why: "Safe and real, but you spend the walking window on the cheaper of the two objectives." },
                { tag: 'GREEDY', credit: 0.05, text: "Wait until we see where they walk before starting anything.", why: "By the time you have the information, the window that made it free has already closed." },
                { tag: 'TRAP', credit: 0, text: "Three on Baron, two on drake.", why: "Two people do not take a drake and three people do not survive a Baron contest. You get neither." },
            ],
        },
        {
            id: 'death_timers', clock: '34:00', phase: 'Death timers',
            brief: "Their mid and jungle are dead on fifty-five second timers.",
            state: ["2 enemies dead - 55s timers", "Baron up", "Your team full HP", "Both inhibitors standing"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Start Baron now. Fifty-five seconds is enough to take it and reset onto mid with the buff.", why: "Baron plus a lane wave turns a death timer into structures. Kills do not." },
                { tag: 'GREEDY', credit: 0.45, text: "Skip Baron and force the mid inhibitor 5v3 right now.", why: "Real pressure, but a 5v3 into two defenders and turret range can still cost two bodies and then Baron." },
                { tag: 'SAFE', credit: 0.05, text: "Take the drakes and the topside towers while they cannot contest.", why: "You spend the whole window on the cheapest part of the map." },
                { tag: 'TRAP', credit: 0, text: "Split up and hunt the three that are still alive.", why: "You traded a guaranteed objective for a manhunt on a map you have no vision on." },
            ],
        },
        {
            id: 'engage_angle', clock: '27:40', phase: 'Engage angle',
            brief: "They are turtling mid and their mid just finished Zhonya.",
            state: ["Enemy mid: Zhonya online", "Their ADC has no Cleanse", "They are under mid tower", "You have a hook support"],
            options: [
                { tag: 'SAFE', credit: 1, text: "Do not engage into the tower. Push the wave in and rotate to the objective we can take for free.", why: "Hooking into five people under a turret is the fight they have already set up for. Take the map instead." },
                { tag: 'TEMPO', credit: 0.45, text: "Flank through the side brush with the support and only go on the ADC.", why: "The angle is right, but doing it into turret range with a full wave down still means you are diving." },
                { tag: 'GREEDY', credit: 0.05, text: "Dive them anyway. We have more damage.", why: "More damage does not survive turret aggro plus a stopwatch that eats your engage." },
                { tag: 'TRAP', credit: 0, text: "Hook the frontline tank to start the fight.", why: "Landing a hook on the person who wanted to be hooked is how you begin a fight you did not want." },
            ],
        },
        {
            id: 'comp_mismatch', clock: '30:30', phase: 'Comp mismatch',
            brief: "You have poke and a split threat; they have hard engage.",
            state: ["Your comp: poke plus 1-3-1", "Their comp: front to back engage", "Baron 2:00", "Your top has Teleport"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Play 1-3-1. Top splits bot side, three hold mid, Baron only happens off a numbers advantage.", why: "Poke wins by never letting an engage comp find a five man fight. Make them choose which lane to lose." },
                { tag: 'SAFE', credit: 0.45, text: "Group mid and poke them off the wave before we look at Baron.", why: "Works right up until they find one engage. Grouping is exactly the shape their comp wants." },
                { tag: 'GREEDY', credit: 0.05, text: "Force Baron now and dare them to contest.", why: "A pit contest is a coin flip in a corridor, which is the one place their comp is strongest." },
                { tag: 'TRAP', credit: 0, text: "Group all five and take the fight in the pit.", why: "You drafted poke specifically so that you would never have to do this." },
            ],
        },
        {
            id: 'smite_fight', clock: '17:55', phase: 'Smite fight',
            brief: "Drake is at fifteen hundred and their jungler has no Smite.",
            state: ["Drake 1500 HP", "Their Smite used 0:20 ago", "You are 4v5 - your top is walking", "Your Smite is up"],
            options: [
                { tag: 'GREEDY', credit: 1, text: "Smite it out now and disengage. Their jungler cannot steal it.", why: "No enemy Smite means the objective is yours the second you decide to take it. Take it, then leave." },
                { tag: 'SAFE', credit: 0.45, text: "Hold pit vision and wait ten seconds for our top to arrive before starting.", why: "Safer, but ten seconds is plenty for them to set up or simply back off with the drake still standing." },
                { tag: 'TEMPO', credit: 0.05, text: "Start the drake and commit to the 4v5 if they walk in.", why: "Securing the objective is free. Fighting a man down for it is not." },
                { tag: 'TRAP', credit: 0, text: "Give the drake and take the topside tower instead.", why: "You are trading a free objective for a slow one because you did not read the Smite timer." },
            ],
        },
        {
            id: 'sup_roam', clock: '08:45', phase: 'Support roam',
            brief: "Their support has been missing from bot for twenty-five seconds.",
            state: ["Enemy support missing 0:25", "Their mid wave pushing in", "Your mid at 40 percent, no Flash", "Bot is 2v1 in your favour"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Mid backs off to tower, bot forces the 2v1 for the plate before the support gets back.", why: "A roam costs them their lane. Punish the place they left, not the place they are going." },
                { tag: 'SAFE', credit: 0.45, text: "Everyone plays safe until we see the support again.", why: "Nothing bad happens and nothing good does either. You paid for the roam and collected nothing." },
                { tag: 'GREEDY', credit: 0.05, text: "Mid holds the wave and dares them to show.", why: "A flashless laner at forty percent holding a pushing wave is the exact target the roam is for." },
                { tag: 'TRAP', credit: 0, text: "Jungler follows the roam into their jungle blind.", why: "You walk into a place where the count could be 1v3, chasing somebody with a head start." },
            ],
        },
        {
            id: 'closing', clock: '36:20', phase: 'Closing',
            brief: "You have Baron, an eight thousand lead, and two of them are dead.",
            state: ["Gold: +8.0k", "Baron buff active", "2 enemies dead - 50s", "Wave arriving mid, inhib exposed"],
            options: [
                { tag: 'GREEDY', credit: 1, text: "End it. Walk in, take the nexus turrets and close the game.", why: "Eight thousand gold, Baron and a 5v3. Any call that is not ending is a call to keep playing a game you already won." },
                { tag: 'TEMPO', credit: 0.45, text: "Take the second inhibitor first, then reset and come back with the next wave.", why: "It works, but every extra minute is another chance to hand back a lead that is currently unloseable." },
                { tag: 'SAFE', credit: 0.05, text: "Back off and take Elder before we commit.", why: "You gave them a free minute to buy, respawn and find one pick." },
                { tag: 'TRAP', credit: 0, text: "Chase the three alive into the jungle for the shutdowns.", why: "Shutdown gold you will never need, bought with the only lead that mattered." },
            ],
        },
        {
            id: 'defending', clock: '29:00', phase: 'Defending',
            brief: "You are six thousand down and they are setting up Baron.",
            state: ["Gold: -6.0k", "They are grouping at the pit", "Your top splitting bot with TP", "Both your inhibitors standing"],
            options: [
                { tag: 'SAFE', credit: 1, text: "Everyone defends mid under tower; top keeps the side wave pushing so they can never fully commit.", why: "From behind, the wave is your only weapon. A side lane they have to answer is worth more than a fight you lose." },
                { tag: 'TEMPO', credit: 0.45, text: "All five contest from the fog with vision and look for the Smite steal.", why: "A genuine out, but a failed contest at six thousand down usually ends the game on the spot." },
                { tag: 'GREEDY', credit: 0.05, text: "Meet them at the pit and take the 5v5 head on.", why: "You are six thousand gold worse in every single duel that fight contains." },
                { tag: 'TRAP', credit: 0, text: "Send the top laner into their base while they take Baron.", why: "Two towers and an inhibitor turret with no Baron buff is not a race, it is a countdown." },
            ],
        },
        {
            id: 'summoners', clock: '14:30', phase: 'Summoners',
            brief: "Their bot lane burned both Flashes thirty seconds ago.",
            state: ["Enemy ADC and support: Flash down", "Drake 1:00", "Herald up, jungler top side", "Your bot has priority"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Herald goes down top, jungler rotates bot, and we take the drake fight while both their summoners are down.", why: "You bank the Herald and cash the Flash timers on the same rotation. Nothing expires unused." },
                { tag: 'SAFE', credit: 0.45, text: "Take Herald, set drake vision, and take it uncontested if they do not show.", why: "Solid, but you let a five minute Flash timer go unused because you did not want the fight." },
                { tag: 'GREEDY', credit: 0.05, text: "Dive bot 3v2 right now and let Herald expire.", why: "You spend an objective to buy a kill you could have had inside the drake fight anyway." },
                { tag: 'TRAP', credit: 0, text: "Note the Flashes and keep farming; we fight at full build.", why: "Timers are worthless the second you decide not to use them." },
            ],
        },
        {
            id: 'plates', clock: '09:40', phase: 'Plates',
            brief: "Turret plating falls in twenty seconds and your mid has the wave.",
            state: ["Plates gone in 0:20", "Mid wave crashing", "2 plates left on their mid tower", "Enemy jungler visible bot side"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Mid crashes and takes both plates; jungler and support step mid to cover the crash.", why: "Six hundred and forty gold with the enemy jungler on camera on the other side of the map. This is free money." },
                { tag: 'SAFE', credit: 0.45, text: "Mid takes one plate and steps off before the timer.", why: "You leave three hundred and twenty gold on a turret that will never be worth that much again." },
                { tag: 'GREEDY', credit: 0.05, text: "Everyone rotates mid for the tower and we give up the drake.", why: "You trade a permanent objective for gold that is about to stop existing anyway." },
                { tag: 'TRAP', credit: 0, text: "Mid backs now to hit the item spike.", why: "Recalling twenty seconds before the most gold-dense window in the laning phase." },
            ],
        },
        {
            id: 'baron_defence', clock: '32:10', phase: 'Baron defence',
            brief: "They have Baron and are walking down mid with ninety seconds on it.",
            state: ["Enemy Baron buff 1:30", "Gold even", "Your comp wins a straight 5v5", "Two of your turrets exposed"],
            options: [
                { tag: 'SAFE', credit: 1, text: "Give the mid turret, hold the second wave at the inhibitor turret and fight when the buff is nearly out.", why: "Buffs expire, turrets do not come back. Trade the cheap structure for the timer, then take the fight you actually win." },
                { tag: 'TEMPO', credit: 0.45, text: "Take the drake on the far side of the map while they push mid.", why: "A fine trade, but if the mid inhibitor goes down the drake stack does not save you." },
                { tag: 'GREEDY', credit: 0.05, text: "Fight them in mid lane now before they get more structures.", why: "You are choosing to fight empowered minions and a Baron buff on their timing rather than yours." },
                { tag: 'TRAP', credit: 0, text: "Split up and defend all three lanes.", why: "One-versus-five in three different places is three losses at once." },
            ],
        },
        {
            id: 'herald_clock', clock: '11:15', phase: 'Herald clock',
            brief: "Herald has forty seconds left in your pocket.",
            state: ["Herald expires in 0:40", "Their mid tower: 3 plates, wave arriving", "Bot tower at 40 percent, no plates", "Enemy mid is base"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Drop it mid on the plated tower with the wave already there and their mid still walking.", why: "Plates plus a tower plus an empty lane. Herald pays out most where the gold has not been claimed yet." },
                { tag: 'SAFE', credit: 0.45, text: "Use it bot on the tower that is already at forty percent for the guaranteed structure.", why: "You get a turret, but you leave three plates of gold behind and spend it on the cheaper half of the map." },
                { tag: 'GREEDY', credit: 0.05, text: "Hold it and use it after the drake fight.", why: "It expires in forty seconds. A Herald you never dropped is two hundred gold set on fire." },
                { tag: 'TRAP', credit: 0, text: "Drop it top with nobody in the lane.", why: "Unescorted Herald into a defended tower dies to two minions and a laner." },
            ],
        },
        {
            id: 'split_pressure', clock: '23:45', phase: 'Split pressure',
            brief: "Your split pusher is deep and four of them are visible mid.",
            state: ["Top alone at their bot inhib turret", "4 of them visible mid", "Their jungler not visible", "Baron 0:15"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Four hold mid to keep them honest, top keeps hitting, and nobody starts Baron until the fifth shows.", why: "The split is only free while they have to look at it. Starting Baron blind is the one thing that makes them leave." },
                { tag: 'SAFE', credit: 0.45, text: "Top backs out and we set Baron vision as five.", why: "Tidy, but you give up the pressure that was forcing four people to stand still." },
                { tag: 'GREEDY', credit: 0.05, text: "Start Baron with four while top holds their attention.", why: "You are 4v4 at best in the pit against a jungler nobody has seen, with a Smite you cannot guarantee." },
                { tag: 'TRAP', credit: 0, text: "Send a second body to help the split.", why: "Now you are 3v4 mid, and the two of you still cannot take an inhibitor before they collapse." },
            ],
        },
        {
            id: 'level_spike', clock: '07:20', phase: 'Level spike',
            brief: "Your mid is one wave from six and theirs is flashless at five.",
            state: ["Your mid: 1 wave from level 6", "Enemy mid level 5, Flash down 4:00", "Your jungler on their raptors", "Mid wave is neutral"],
            options: [
                { tag: 'TEMPO', credit: 1, text: "Hold the gank until mid hits six, shove the wave, then come from the river.", why: "Ultimate plus no Flash is a kill. Ten seconds of patience turns a maybe into a certainty." },
                { tag: 'GREEDY', credit: 0.45, text: "Gank now while the Flash is down; the level lead is enough.", why: "Often works, but without the ultimate you need him to misplay rather than simply to be standing there." },
                { tag: 'SAFE', credit: 0.05, text: "Dive the tower at level five.", why: "You are diving with less damage than you will have in one wave, for exactly the same target." },
                { tag: 'TRAP', credit: 0, text: "Forget mid and invade their blue buff.", why: "You walk away from the best gank on the map to take a camp you could have had later." },
            ],
        },
        {
            id: 'bounties', clock: '22:20', phase: 'Bounties',
            brief: "You are five thousand up but they just aced you and the bounties are live.",
            state: ["Gold: +5.0k", "3 of your team carry 700g bounties", "They aced you 40s ago", "Third drake spawns in 0:40"],
            options: [
                { tag: 'SAFE', credit: 1, text: "Play the map, not the fight. Push the waves in, take drake only on clean vision, and never face-check.", why: "Ahead with bounties out, one bad fight is a two thousand gold swing. Structures cannot be shut down." },
                { tag: 'TEMPO', credit: 0.45, text: "Give this drake and take the topside towers and Baron vision instead.", why: "Reasonable, but conceding stacks with a lead invites the exact Soul point fight you are trying to avoid." },
                { tag: 'GREEDY', credit: 0.05, text: "Force the drake fight immediately to kill their momentum.", why: "Momentum is not a resource. Their bounties are." },
                { tag: 'TRAP', credit: 0, text: "Split up and farm the bounties off.", why: "Five solo players with seven hundred gold on their heads is a menu, not a plan." },
            ],
        },
    ];

    // -- Round state -----------------------------------------------------
    let stage = 'intro';        // intro | playing | result
    let step = 'ask';           // ask | reveal
    let deck = [];
    let idx = 0;
    let cur = null;             // { s, opts }
    let picked = -1;
    let results = [];
    let remain = 1;
    let askStart = 0;
    let lockUntil = 0;
    let streak = 0;
    let bestStreak = 0;

    let reps = 10;
    let limitMs = 9000;
    let revealMs = 2400;
    let expo = 0.95;

    let finalScore = 0;
    let finalMeta = null;

    let raf = null;
    let revealTimer = null;
    let nextBtn = null;
    let reduceMotion = false;
    let mq = null;

    $: secsLeft = Math.max(0, (remain * limitMs) / 1000);
    $: barTone = remain > 0.5 ? 'ok' : remain > 0.25 ? 'warn' : 'bad';
    $: bestOpt = cur ? cur.opts.find(o => o.credit >= 0.9) : null;
    $: secondOpt = cur ? cur.opts.find(o => o.credit >= 0.4 && o.credit < 0.9) : null;
    $: pickedOpt = cur && picked >= 0 ? cur.opts[picked] : null;
    $: liveHits = results.filter(r => r.credit >= 0.9).length;

    function shuffle(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function stopRaf() {
        if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    }
    function stopReveal() {
        if (revealTimer !== null) { clearTimeout(revealTimer); revealTimer = null; }
    }

    // -- Loop ------------------------------------------------------------
    function tickFrame(now) {
        raf = null;
        if (stage !== 'playing' || step !== 'ask') return;
        const elapsed = now - askStart;
        const left = 1 - elapsed / limitMs;
        remain = left > 0 ? left : 0;
        if (remain <= 0) { commit(-1); return; }
        raf = requestAnimationFrame(tickFrame);
    }

    function startRound() {
        const c = CFG[dlvl];
        reps = Math.min(c.reps, SCENARIOS.length);
        limitMs = c.limit;
        revealMs = c.reveal;
        expo = c.expo;
        deck = shuffle(SCENARIOS).slice(0, reps);
        idx = 0;
        results = [];
        streak = 0;
        bestStreak = 0;
        finalScore = 0;
        finalMeta = null;
        stage = 'playing';
        loadScenario();
    }

    function loadScenario() {
        const s = deck[idx];
        cur = { s, opts: shuffle(s.options) };
        picked = -1;
        step = 'ask';
        remain = 1;
        askStart = performance.now();
        lockUntil = askStart + 280;   // swallows the keypress that skipped the reveal
        stopRaf();
        raf = requestAnimationFrame(tickFrame);
    }

    function choose(i) {
        if (stage !== 'playing' || step !== 'ask' || picked !== -1) return;
        if (performance.now() < lockUntil) return;
        commit(i);
    }

    function commit(i) {
        stopRaf();
        const ms = Math.max(0, performance.now() - askStart);
        const credit = i >= 0 && cur ? cur.opts[i].credit : 0;
        const frac = i >= 0 ? Math.max(0, Math.min(1, 1 - ms / limitMs)) : 0;
        picked = i;
        remain = 0;
        results = results.concat([{
            credit,
            speed: credit * frac,
            ms: i >= 0 ? ms : limitMs,
            timedOut: i < 0,
        }]);
        if (credit >= 0.9) {
            streak += 1;
            if (streak > bestStreak) bestStreak = streak;
        } else {
            streak = 0;
        }
        step = 'reveal';
        stopReveal();
        revealTimer = setTimeout(advance, revealMs + (i < 0 ? 700 : 0));
        tick().then(() => { if (nextBtn) nextBtn.focus(); });
    }

    function advance() {
        stopReveal();
        if (stage !== 'playing' || step !== 'reveal') return;
        idx += 1;
        if (idx >= deck.length) finishRound();
        else loadScenario();
    }

    function finishRound() {
        stopRaf();
        stopReveal();
        const n = results.length || 1;
        const acc = results.reduce((s, r) => s + r.credit, 0) / n;
        const spd = results.reduce((s, r) => s + r.speed, 0) / n;
        const raw = 0.86 * acc + 0.14 * spd;
        const sc = Math.pow(Math.max(0, Math.min(1, raw)), expo);
        finalScore = Math.max(0, Math.min(1, sc));

        const hits = results.filter(r => r.credit >= 0.9).length;
        const partials = results.filter(r => r.credit >= 0.4 && r.credit < 0.9).length;
        const timeouts = results.filter(r => r.timedOut).length;
        const misses = n - hits - partials;
        const answered = results.filter(r => !r.timedOut);
        const avgSec = answered.length
            ? answered.reduce((s, r) => s + r.ms, 0) / answered.length / 1000
            : 0;
        const bestList = results.filter(r => r.credit >= 0.9).map(r => r.ms);
        const bestSec = bestList.length ? Math.min.apply(null, bestList) / 1000 : 0;

        const label = finalScore >= 0.90 ? 'Franchise Shotcaller'
            : finalScore >= 0.78 ? 'Primary Caller'
            : finalScore >= 0.62 ? 'Clear Comms'
            : finalScore >= 0.45 ? 'Second Voice'
            : finalScore >= 0.28 ? 'Needs Reps'
            : 'Silent On Comms';

        finalMeta = {
            label,
            accuracy: Math.round(acc * 1000) / 1000,
            hits,
            misses,
            streak: bestStreak,
            best: Math.round(bestSec * 10) / 10,
            detail: hits + '/' + n + ' best calls, ' + partials + ' runner-up, '
                + timeouts + ' timed out, ' + (Math.round(avgSec * 10) / 10) + 's average',
            partials,
            timeouts,
            reps: n,
            avgSec: Math.round(avgSec * 100) / 100,
            difficulty: dlvl,
            game: 'shotcall',
        };
        stage = 'result';
    }

    function finishSession() {
        if (typeof onComplete === 'function') onComplete(finalScore, finalMeta || {});
    }
    function quit() {
        if (typeof onQuit === 'function') onQuit();
    }

    // -- Input -----------------------------------------------------------
    function onKey(e) {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        if (stage === 'intro') {
            if (e.key === 'Escape') { e.preventDefault(); quit(); }
            return;
        }
        if (stage !== 'playing') return;
        if (step === 'ask') {
            const n = '1234'.indexOf(e.key);
            if (n >= 0) { e.preventDefault(); choose(n); }
        }
    }

    function onMotionChange(e) { reduceMotion = !!e.matches; }

    onMount(() => {
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', onKey);
            if (window.matchMedia) {
                mq = window.matchMedia('(prefers-reduced-motion: reduce)');
                reduceMotion = !!mq.matches;
                if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
                else if (mq.addListener) mq.addListener(onMotionChange);
            }
        }
    });

    onDestroy(() => {
        stopRaf();
        stopReveal();
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
        if (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMotionChange);
            else if (mq.removeListener) mq.removeListener(onMotionChange);
        }
        mq = null;
    });

    function pipClass(r) {
        if (r.timedOut) return 'pip bad';
        if (r.credit >= 0.9) return 'pip good';
        if (r.credit >= 0.4) return 'pip mid';
        return 'pip bad';
    }
    // st and pk are passed in explicitly so Svelte tracks them as dependencies
    // of the class attribute - a bare optClass(o, i) would never re-run.
    function optClass(o, i, st, pk) {
        if (st !== 'reveal') return 'opt';
        let c = 'opt revealed';
        if (o.credit >= 0.9) c += ' o-best';
        else if (o.credit >= 0.4) c += ' o-second';
        else c += ' o-dim';
        if (i === pk) c += ' o-picked';
        return c;
    }
    $: verdict = step !== 'reveal' ? ''
        : picked < 0 ? 'No call. Silence costs the round.'
        : pickedOpt && pickedOpt.credit >= 0.9 ? 'Correct call.'
        : pickedOpt && pickedOpt.credit >= 0.4 ? 'Runner-up. Partial credit.'
        : pickedOpt && pickedOpt.credit > 0 ? 'Defensible, but not the call.'
        : 'Wrong call.';
    $: verdictTone = step !== 'reveal' ? ''
        : picked < 0 ? 'v-bad'
        : pickedOpt && pickedOpt.credit >= 0.9 ? 'v-good'
        : pickedOpt && pickedOpt.credit >= 0.4 ? 'v-mid'
        : 'v-bad';
</script>

<section class="cc" class:rm={reduceMotion} aria-label="Comms Check shotcalling drill">

    <!-- == INTRO == -->
    {#if stage === 'intro'}
        <div class="pane intro">
            <div class="eyebrow">Shotcalling <span class="dot">/</span> LDR</div>
            <h2 class="title"><span class="tico" aria-hidden="true">{ICON}</span>{drill && drill.name ? drill.name : 'Comms Check'}</h2>

            <p class="body">
                Macro is not a feeling, it is a checklist read out loud before anyone has time to think.
                This drill throws compact game states at you on a clock - gold, objective timers, death
                timers, summoners, wave states - and asks for the call. Every scenario has a best call and
                a runner-up that is nearly as good, plus one option that is greedy and one that is simply
                bait. Reading the state is half of it; saying it before the window closes is the other half.
            </p>

            {#if drill && drill.desc}
                <p class="body dim">{drill.desc}</p>
            {/if}

            <div class="how">
                <div class="how-row"><span class="how-k">1</span><span>Read the state chips, then pick one of four calls.</span></div>
                <div class="how-row"><span class="how-k">2</span><span>Keys <b>1</b> - <b>4</b> or click. Answering early is worth a small bonus.</span></div>
                <div class="how-row"><span class="how-k">3</span><span>Letting the timer run out scores zero. Guessing beats silence.</span></div>
                <div class="how-row"><span class="how-k">4</span><span>The reveal names the right call and the runner-up. Space skips it.</span></div>
            </div>

            <div class="chips">
                <div class="chip"><span class="c-v">{dcfg.name}</span><span class="c-l">Level {dlvl}</span></div>
                <div class="chip"><span class="c-v">{dcfg.reps}</span><span class="c-l">Scenarios</span></div>
                <div class="chip"><span class="c-v">{(dcfg.limit / 1000).toFixed(1)}s</span><span class="c-l">Per call</span></div>
            </div>

            <div class="actions">
                <button class="btn ghost" on:click={quit} aria-label="Back out of this drill without a score">Back</button>
                <button class="btn go" on:click={startRound} aria-label="Start the Comms Check drill">Start Drill</button>
            </div>
        </div>
    {/if}

    <!-- == PLAYING == -->
    {#if stage === 'playing' && cur}
        <div class="pane play">
            <div class="hud">
                <div class="hud-l">
                    <span class="hud-tag">Comms Check</span>
                    <span class="hud-n">Call {idx + 1} <span class="sep">/</span> {deck.length}</span>
                </div>
                <div class="hud-r">
                    <span class="hud-hits">{liveHits} correct</span>
                    {#if streak >= 2}<span class="hud-streak">{streak} in a row</span>{/if}
                </div>
            </div>

            <div class="pips" aria-hidden="true">
                {#each results as r}<span class={pipClass(r)}></span>{/each}
                {#each Array(Math.max(0, deck.length - results.length)) as _}<span class="pip empty"></span>{/each}
            </div>

            <div class="bar-wrap" role="progressbar" aria-label="Time left to make the call"
                 aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(remain * 100)}>
                <div class="bar {barTone}" class:frozen={step === 'reveal'} style="width:{remain * 100}%"></div>
            </div>

            <div class="scen">
                <div class="scen-top">
                    <span class="clock">{cur.s.clock}</span>
                    <span class="phase">{cur.s.phase}</span>
                    <span class="secs" class:low={remain <= 0.25 && step === 'ask'}>
                        {step === 'ask' ? secsLeft.toFixed(1) + 's' : '--'}
                    </span>
                </div>
                <p class="brief">{cur.s.brief}</p>
                <div class="state">
                    {#each cur.s.state as line}
                        <span class="sc">{line}</span>
                    {/each}
                </div>
            </div>

            <div class="opts">
                {#each cur.opts as o, i}
                    <button
                        class={optClass(o, i, step, picked)}
                        on:click={() => choose(i)}
                        disabled={step === 'reveal'}
                        aria-label={'Call ' + (i + 1) + ': ' + o.text}
                    >
                        <span class="okey">{i + 1}</span>
                        <span class="otext">{o.text}</span>
                        {#if step === 'reveal'}
                            <span class="obadge">{o.tag}</span>
                        {/if}
                    </button>
                {/each}
            </div>

            {#if step === 'reveal'}
                <div class="reveal" aria-live="polite">
                    <div class="verdict {verdictTone}">
                        <span class="v-txt">{verdict}</span>
                        <span class="v-pts">
                            {picked >= 0 && pickedOpt ? '+' + pickedOpt.credit.toFixed(2) : '+0.00'}
                        </span>
                    </div>

                    {#if bestOpt}
                        <div class="row r-best">
                            <span class="r-tag">Best call</span>
                            <p class="r-why">{bestOpt.why}</p>
                        </div>
                    {/if}
                    {#if secondOpt}
                        <div class="row r-second">
                            <span class="r-tag">Runner-up</span>
                            <p class="r-why">{secondOpt.why}</p>
                        </div>
                    {/if}
                    {#if pickedOpt && pickedOpt.credit < 0.4}
                        <div class="row r-yours">
                            <span class="r-tag">Your call</span>
                            <p class="r-why">{pickedOpt.why}</p>
                        </div>
                    {/if}

                    <button class="btn next" bind:this={nextBtn} on:click={advance}
                            aria-label="Continue to the next scenario">
                        {idx + 1 >= deck.length ? 'See Results' : 'Next Call'} <span class="nk">Space</span>
                    </button>
                </div>
            {/if}
        </div>
    {/if}

    <!-- == RESULT == -->
    {#if stage === 'result' && finalMeta}
        <div class="pane res">
            <div class="eyebrow">Session complete <span class="dot">/</span> {dcfg.name}</div>
            <div class="score-wrap">
                <div class="score">{Math.round(finalScore * 100)}</div>
                <div class="score-of">/ 100</div>
            </div>
            <div class="score-bar"><div class="score-fill" style="width:{finalScore * 100}%"></div></div>
            <div class="label">{finalMeta.label}</div>

            <div class="pips big" aria-label="Result of each scenario in order">
                {#each results as r}<span class={pipClass(r)}></span>{/each}
            </div>

            <div class="grid">
                <div class="cell"><span class="cv good">{finalMeta.hits}</span><span class="cl">Best calls</span></div>
                <div class="cell"><span class="cv mid">{finalMeta.partials}</span><span class="cl">Runner-ups</span></div>
                <div class="cell"><span class="cv bad">{finalMeta.misses}</span><span class="cl">Missed</span></div>
                <div class="cell"><span class="cv">{finalMeta.timeouts}</span><span class="cl">Timed out</span></div>
                <div class="cell"><span class="cv">{finalMeta.avgSec.toFixed(1)}s</span><span class="cl">Avg decision</span></div>
                <div class="cell"><span class="cv">{finalMeta.streak}</span><span class="cl">Best streak</span></div>
            </div>

            <p class="verdict-line">
                {#if finalScore >= 0.85}
                    You are the voice. Fast, decisive, and right about the objective almost every time.
                {:else if finalScore >= 0.62}
                    Solid comms. The calls are correct; a few of them arrived a beat after the window.
                {:else if finalScore >= 0.4}
                    You see the map but you argue with it. Commit to the objective earlier.
                {:else}
                    Too slow and too greedy. Objectives first, fights second, silence never.
                {/if}
            </p>

            <div class="actions">
                <button class="btn go wide" on:click={finishSession} aria-label="Finish the session and bank the score">
                    Finish Session
                </button>
            </div>
        </div>
    {/if}
</section>

<style>
    .cc {
        --acc: #ec4899;
        --acc-dim: rgba(236, 72, 153, 0.15);
        --good: #22c55e;
        --mid: #f59e0b;
        --bad: #ef4444;
        max-width: 720px;
        margin: 0 auto;
        width: 100%;
        color: #e2e8f0;
        font-size: 13px;
    }
    .pane {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(236, 72, 153, 0.15);
        border-radius: 20px;
        padding: 20px;
    }
    @media (max-width: 420px) { .pane { padding: 14px; border-radius: 16px; } }

    .eyebrow {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px;
        color: #475569; margin-bottom: 8px;
    }
    .eyebrow .dot { color: rgba(236, 72, 153, 0.5); margin: 0 2px; }

    /* -- INTRO -- */
    .title {
        font-size: 22px; font-weight: 900; color: #f8d6e6; line-height: 1.2;
        display: flex; align-items: center; gap: 9px; margin-bottom: 12px;
    }
    .tico { font-size: 20px; filter: saturate(0.9); }
    .body { font-size: 12.5px; line-height: 1.65; color: #94a3b8; margin-bottom: 12px; }
    .body.dim { color: #64748b; font-size: 11.5px; border-left: 2px solid rgba(236,72,153,0.25); padding-left: 10px; }

    .how {
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 14px; padding: 12px; margin-bottom: 14px;
        display: flex; flex-direction: column; gap: 8px;
    }
    .how-row { display: flex; align-items: flex-start; gap: 9px; font-size: 11.5px; color: #94a3b8; line-height: 1.45; }
    .how-row b { color: #f9a8d4; }
    .how-k {
        flex: 0 0 auto; width: 17px; height: 17px; border-radius: 6px;
        background: var(--acc-dim); border: 1px solid rgba(236, 72, 153, 0.25);
        color: #f9a8d4; font-size: 9px; font-weight: 900;
        display: flex; align-items: center; justify-content: center; margin-top: 1px;
    }

    .chips { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .chip {
        flex: 1 1 90px; background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.2); border-radius: 12px;
        padding: 9px 10px; text-align: center;
    }
    .c-v { display: block; font-size: 14px; font-weight: 900; color: #f9a8d4; }
    .c-l { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin-top: 3px; }

    .actions { display: flex; gap: 10px; }
    .btn {
        font-family: inherit; font-weight: 900; font-size: 11px;
        text-transform: uppercase; letter-spacing: 1.1px;
        border-radius: 12px; padding: 12px 18px; cursor: pointer;
        border: 1px solid transparent; transition: background 0.14s, border-color 0.14s, color 0.14s, box-shadow 0.14s, transform 0.14s;
    }
    .btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.35); }
    .ghost { background: rgba(51, 65, 85, 0.35); border-color: rgba(71, 85, 105, 0.3); color: #94a3b8; }
    .ghost:hover { background: rgba(71, 85, 105, 0.5); color: #e2e8f0; }
    .go {
        flex: 1; background: linear-gradient(135deg, #be185d 0%, #ec4899 100%);
        color: #fff5fa; box-shadow: 0 4px 14px rgba(236, 72, 153, 0.22);
    }
    .go:hover { box-shadow: 0 6px 20px rgba(236, 72, 153, 0.4); transform: translateY(-1px); }
    .cc.rm .go:hover { transform: none; }
    .wide { width: 100%; }

    /* -- HUD -- */
    .hud { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .hud-l, .hud-r { display: flex; align-items: center; gap: 9px; }
    .hud-tag { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    .hud-n { font-size: 11px; font-weight: 900; color: #f9a8d4; }
    .hud-n .sep { color: #334155; }
    .hud-hits { font-size: 10px; font-weight: 800; color: #64748b; }
    .hud-streak {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px;
        color: #4ade80; background: rgba(34, 197, 94, 0.12);
        border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 99px; padding: 2px 8px;
    }

    .pips { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
    .pip { width: 100%; max-width: 26px; flex: 1 1 10px; height: 4px; border-radius: 99px; background: rgba(51, 65, 85, 0.4); }
    .pip.good { background: #22c55e; }
    .pip.mid { background: #f59e0b; }
    .pip.bad { background: #ef4444; }
    .pip.empty { background: rgba(51, 65, 85, 0.3); }
    .pips.big { margin: 14px 0 16px; }
    .pips.big .pip { height: 6px; }

    .bar-wrap {
        height: 6px; border-radius: 99px; background: rgba(15, 23, 42, 0.8);
        overflow: hidden; margin-bottom: 14px;
    }
    .bar { height: 100%; border-radius: 99px; background: var(--acc); }
    .bar.warn { background: #f59e0b; }
    .bar.bad { background: #ef4444; }
    .bar.frozen { opacity: 0.25; }

    /* -- Scenario -- */
    .scen {
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.22);
        border-radius: 14px; padding: 13px; margin-bottom: 12px;
    }
    .scen-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .clock {
        font-size: 11px; font-weight: 900; color: #f9a8d4;
        background: var(--acc-dim); border: 1px solid rgba(236, 72, 153, 0.2);
        border-radius: 7px; padding: 2px 7px; letter-spacing: 0.5px;
    }
    .phase { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.3px; color: #64748b; }
    .secs { margin-left: auto; font-size: 12px; font-weight: 900; color: #64748b; font-variant-numeric: tabular-nums; }
    .secs.low { color: #f87171; }
    .cc:not(.rm) .secs.low { animation: ccBlink 0.9s ease-in-out infinite; }
    @keyframes ccBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

    .brief { font-size: 13.5px; font-weight: 800; color: #e2e8f0; line-height: 1.45; margin-bottom: 10px; }
    .state { display: flex; flex-wrap: wrap; gap: 5px; }
    .sc {
        font-size: 10px; font-weight: 700; color: #94a3b8;
        background: rgba(12, 16, 28, 0.7); border: 1px solid rgba(51, 65, 85, 0.25);
        border-radius: 8px; padding: 4px 8px; line-height: 1.3;
    }

    /* -- Options -- */
    .opts { display: flex; flex-direction: column; gap: 7px; }
    .opt {
        display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
        font-family: inherit; font-size: 12px; line-height: 1.45; color: #cbd5e1;
        background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 12px; padding: 11px 12px; cursor: pointer;
        transition: background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s;
        position: relative;
    }
    .opt:hover:not(:disabled) { background: rgba(30, 41, 59, 0.6); border-color: rgba(236, 72, 153, 0.35); color: #f1f5f9; }
    .opt:focus-visible { outline: none; border-color: rgba(236, 72, 153, 0.6); box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.28); }
    .opt:disabled { cursor: default; }
    .okey {
        flex: 0 0 auto; width: 20px; height: 20px; border-radius: 7px;
        background: rgba(51, 65, 85, 0.5); border: 1px solid rgba(71, 85, 105, 0.35);
        color: #94a3b8; font-size: 10px; font-weight: 900;
        display: flex; align-items: center; justify-content: center;
    }
    .opt:hover:not(:disabled) .okey { background: var(--acc-dim); border-color: rgba(236, 72, 153, 0.3); color: #f9a8d4; }
    .otext { flex: 1 1 auto; min-width: 0; }
    .obadge {
        flex: 0 0 auto; align-self: center; font-size: 8px; font-weight: 900;
        letter-spacing: 1px; color: #64748b; border: 1px solid rgba(71, 85, 105, 0.3);
        border-radius: 6px; padding: 2px 5px;
    }
    .o-best { background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.4); color: #d1fae5; }
    .o-best .okey { background: rgba(34, 197, 94, 0.18); border-color: rgba(34, 197, 94, 0.3); color: #4ade80; }
    .o-best .obadge { color: #4ade80; border-color: rgba(34, 197, 94, 0.35); }
    .o-second { background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.35); color: #fde68a; }
    .o-second .okey { background: rgba(245, 158, 11, 0.16); border-color: rgba(245, 158, 11, 0.28); color: #fbbf24; }
    .o-second .obadge { color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
    .o-dim { opacity: 0.5; }
    .o-picked { box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.55); opacity: 1; }
    .o-picked.o-dim { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.35); }

    /* -- Reveal -- */
    .reveal { margin-top: 12px; }
    .verdict {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        border-radius: 11px; padding: 9px 12px; margin-bottom: 9px;
        font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.9px;
    }
    .v-good { background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.28); color: #4ade80; }
    .v-mid { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.28); color: #fbbf24; }
    .v-bad { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171; }
    .v-txt { min-width: 0; }
    .v-pts { font-variant-numeric: tabular-nums; opacity: 0.85; }

    .row {
        display: flex; align-items: flex-start; gap: 9px; padding: 8px 10px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 11px; margin-bottom: 6px;
    }
    .r-tag {
        flex: 0 0 auto; font-size: 8px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1px; padding: 3px 6px; border-radius: 6px; margin-top: 1px;
    }
    .r-best .r-tag { background: rgba(34, 197, 94, 0.14); color: #4ade80; }
    .r-second .r-tag { background: rgba(245, 158, 11, 0.14); color: #fbbf24; }
    .r-yours .r-tag { background: rgba(239, 68, 68, 0.14); color: #f87171; }
    .r-why { font-size: 11.5px; line-height: 1.5; color: #94a3b8; }

    .next {
        width: 100%; margin-top: 6px;
        background: rgba(51, 65, 85, 0.4); border-color: rgba(236, 72, 153, 0.25); color: #f9a8d4;
        display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .next:hover { background: rgba(236, 72, 153, 0.16); color: #fbcfe8; }
    .nk {
        font-size: 8px; letter-spacing: 1px; color: #64748b;
        border: 1px solid rgba(71, 85, 105, 0.35); border-radius: 5px; padding: 2px 5px;
    }

    /* -- Result -- */
    .res { text-align: center; }
    .score-wrap { display: flex; align-items: baseline; justify-content: center; gap: 6px; margin-top: 6px; }
    .score { font-size: 54px; font-weight: 900; color: #f9a8d4; line-height: 1; letter-spacing: -1px; }
    .score-of { font-size: 12px; font-weight: 800; color: #475569; }
    .score-bar { height: 7px; border-radius: 99px; background: rgba(15, 23, 42, 0.8); overflow: hidden; margin: 12px 0 10px; }
    .score-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #be185d, #f472b6); }
    .cc:not(.rm) .score-fill { transition: width 0.5s ease; }
    .label {
        font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px; color: #e2e8f0;
    }

    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 14px; }
    @media (max-width: 380px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    .cell {
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 12px; padding: 10px 6px;
    }
    .cv { display: block; font-size: 17px; font-weight: 900; color: #e2e8f0; }
    .cv.good { color: #4ade80; }
    .cv.mid { color: #fbbf24; }
    .cv.bad { color: #f87171; }
    .cl { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.9px; color: #475569; margin-top: 3px; }

    .verdict-line { font-size: 12px; line-height: 1.6; color: #94a3b8; margin-bottom: 16px; }
</style>
