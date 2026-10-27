<script>
    // ===================================================================
    //  LoL ULTIMATE CAREER - Hub
    // ===================================================================
    //  The week dashboard. Everything the player does between matches
    //  starts here: the fixture, the activity slots, the week log and the
    //  button that ends the week. The side rail is the "where am I"
    //  column - contract, offers, last result, table position, news.
    //
    //  Nothing in this file owns game rules. Every number comes out of a
    //  career module; the screen only arranges and guards them, because a
    //  brand-new pre-competitive player has no club, no schedule and no
    //  history and still has to look deliberate.

    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';

    import {
        career, careerScreen, careerOverlay, pushOverlay,
        currentTeam, currentPhase, soloRank,
        saveCareer, logWeek, skipMinigames,
    } from '../../stores/career.js';
    import { levelOf, activityXP } from '../../career/training.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    import {
        ACTIVITIES, ACTIVITY_GROUPS, ACTIVITY_GIVES, NEWS_TYPES, CLUB_TIERS, teamById,
        CHAMPION_BY_ID, metaFor, metaTierFor, metaLabelFor, splitForWeek,
        WEEKS_PER_YEAR, PHASES,
    } from '../../career/constants.js';
    import {
        statusInfo, fmtGold, fmtRecord, fmtKDA, ordinal,
        calcOVR, SCOUT_MMR_GATE,
        isAmateurTier,
    } from '../../career/ratings.js';
    import {
        describeTeam, teamStrength, teamStrengthWithPlayer, leagueTable, tournamentNow,
        winChance,
    } from '../../career/teams.js';
    import {
        contractStatusLine, interestedTeams, clubReview, ACADEMY_SCOUT_OVR,
    } from '../../career/contracts.js';
    import { matchRatingLabel } from '../../career/match.js';
    import { normaliseBoards } from '../../career/scoreboard.js';
    import { objectiveProgress, CLEAN_SWEEP_MULT } from '../../career/objectives.js';
    import BracketView from './BracketView.svelte';
    import ClubScout from './ClubScout.svelte';
    import Icon from '../ui/Icon.svelte';
    import {
        ensureSeason, weekSummary, canAdvanceWeek, doActivity,
        startFixture, simFixture, advanceWeek, benchOrStart, activityGate,
        soloQueueCost, burnoutOf, burnoutBenched,
    } from '../../career/engine.js';

    // ---------------------------------------------------------------
    //  local ui state
    // ---------------------------------------------------------------
    let showAllNews = false;
    let busy = false;
    let flash = null;              // { id, text } - echo of the last activity
    let flashTimer = null;
    // The opponent scouting panel, as an in-screen dialog. A team id, never a
    // team object: opponentOf()-style stand-ins for an unconfirmed bracket slot
    // must never reach ClubScout, so this is only ever set from a resolved club.
    let scoutId = null;
    // Which game of the last series the recap scoreboard is showing, as
    // { stamp, key } rather than an index. The stamp is what makes the pick
    // self-expiring: the moment lastMatch is a DIFFERENT match the selection
    // stops matching and the panel falls back to the decider on its own, with
    // no reactive statement writing to a variable it also reads.
    let lmSel = null;

    onMount(() => {
        try { ensureSeason(); saveCareer(); } catch (e) { /* fresh career, no season yet */ }
    });
    onDestroy(() => { if (flashTimer) clearTimeout(flashTimer); });

    // ---------------------------------------------------------------
    //  safe reads - engine calls are wrapped so one bad derived value
    //  never blanks the screen the player lives on
    // ---------------------------------------------------------------
    const SERIES_PHASES = ['spring_po', 'summer_po', 'first_stand', 'msi', 'worlds'];

    function fallbackSummary(c, phase) {
        const fx = (c.season.schedule || []).filter(f => f.week === c.time.week);
        return {
            week: c.time.week, year: c.time.year,
            phase: phase.id, phaseName: phase.name,
            fixtures: fx,
            nextFixture: fx.find(f => !f.played) || null,
            actionsLeft: c.weekly.actionsLeft, actionsMax: c.weekly.actionsMax,
            income: null, canAdvance: true, blockers: [],
        };
    }

    function readSummary(c, phase) {
        try {
            const s = weekSummary(c);
            if (s && typeof s === 'object') return s;
        } catch (e) { /* engine not ready for this state */ }
        return fallbackSummary(c, phase);
    }

    function readGate(c, list) {
        try {
            const g = canAdvanceWeek(c);
            if (typeof g === 'boolean') return { ok: g, reason: g ? '' : 'You cannot end the week yet.' };
            if (g && typeof g === 'object') return { ok: !!g.ok, reason: g.reason || '' };
        } catch (e) { /* fall through */ }
        const unplayed = (list || []).some(f => !f.played);
        return unplayed
            ? { ok: false, reason: 'You still have a fixture to play this week.' }
            : { ok: true, reason: '' };
    }

    function readBench(c) {
        let r = null;
        try { r = benchOrStart(c); } catch (e) { r = null; }
        if (r === null || r === undefined) return { plays: true, reason: '' };
        if (typeof r === 'boolean') return { plays: r, reason: r ? '' : defaultBenchReason(c) };
        if (typeof r === 'string') {
            const benched = r === 'bench' || r === 'benched' || r === 'sub';
            return { plays: !benched, reason: benched ? defaultBenchReason(c) : '' };
        }
        let plays = true;
        if ('plays' in r) plays = !!r.plays;
        else if ('play' in r) plays = !!r.play;
        else if ('starts' in r) plays = !!r.starts;
        else if ('starting' in r) plays = !!r.starting;
        else if ('benched' in r) plays = !r.benched;
        const reason = r.reason || r.benchReason || r.detail || '';
        return { plays, reason: plays ? '' : (reason || defaultBenchReason(c)) };
    }

    function defaultBenchReason(c) {
        const s = statusInfo(c.player.status);
        if (c.player.health < 55) return 'You are not fit enough to be put on stage.';
        return 'The coach has you down as ' + s.name.toLowerCase() + ' this week.';
    }

    function normIncome(v) {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return { salary: v, sponsors: 0, total: v };
        const salary = Number(v.salary) || 0;
        const sponsors = Number(v.sponsors) || 0;
        const total = Number(v.total);
        return { salary, sponsors, total: Number.isFinite(total) ? total : salary + sponsors };
    }

    function normBlockers(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map(b => (typeof b === 'string' ? b : (b && (b.reason || b.text || b.msg)) || ''))
            .filter(Boolean);
    }

    function safeTable(c) {
        try {
            const rows = leagueTable(c);
            return Array.isArray(rows) ? rows : [];
        } catch (e) { return []; }
    }

    function safeInterest(c) {
        try {
            const rows = interestedTeams(c, 3);
            return Array.isArray(rows) ? rows : [];
        } catch (e) { return []; }
    }

    function safeStatusLine(c) {
        try { return contractStatusLine(c) || ''; } catch (e) { return ''; }
    }

    function safeRating(v) {
        try {
            const r = matchRatingLabel(v);
            if (r && r.label) return r;
        } catch (e) { /* fall through */ }
        return { label: (Math.round((Number(v) || 0) * 10) / 10).toFixed(1), color: '#94a3b8' };
    }

    // The ten-player scoreboards for the last result. Boards ride on the GAME
    // LOG, so c.lastMatch.games[i].board is byte-for-byte the data the result
    // screen renders, and career/scoreboard.js is the one normaliser both go
    // through - a second copy here is how the two would drift apart.
    //
    // ABSENT IS AN ORDINARY STATE, not an error: a benched game carries no
    // board, and neither does any result saved before boards existed. An empty
    // list must therefore render NOTHING - no table, no row of dashes - which
    // is what the {#if lmBoard} gate in the panel is for.
    function safeBoards(lm) {
        try {
            const rows = normaliseBoards(lm && lm.games);
            return Array.isArray(rows) ? rows : [];
        } catch (e) { return []; }
    }

    // Identity of the match itself, not of its boards: two different results
    // both hand back keys 'sb0', 'sb1', so the keys alone cannot tell the
    // panel that the series under it has been replaced.
    function matchStamp(lm) {
        if (!lm || typeof lm !== 'object') return '';
        const part = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
        return [part(lm.year), part(lm.week), part(lm.opponentId), part(lm.opponentName)].join('|');
    }

    // The DECIDER by default - the last game played. Opening a Bo5 on game one
    // and saying nothing else would imply that game was the series, which is
    // the one thing this recap must never do; the tabs are how the other games
    // are reached.
    function pickLmBoard(list, sel, stamp) {
        if (!Array.isArray(list) || !list.length) return null;
        if (sel && sel.stamp === stamp) {
            const hit = list.find(b => b && b.key === sel.key);
            if (hit) return hit;
        }
        return list[list.length - 1];
    }

    function myStrengthFor(c) {
        try {
            if (c.player.clubId) {
                const t = teamById(c.player.clubId);
                if (t) return teamStrengthWithPlayer(c, t);
            }
        } catch (e) { /* fall through */ }
        return Math.max(1, calcOVR(c.player.attrs, c.player.role));
    }

    function oppStrengthFor(team, year) {
        if (!team) return 0;
        try { return teamStrength(team, year); } catch (e) { return team.strength || 50; }
    }

    // What the NEXT solo queue session costs on top of its energy. The engine
    // owns the arithmetic (engine.soloQueueCost); this only has to survive a
    // save with no weekly.counts at all, which is a state careerRender drives.
    function safeSoloCost(career) {
        try {
            const r = soloQueueCost(career);
            if (!r || typeof r !== 'object') return null;
            return {
                prior: Math.max(0, Number(r.prior) || 0),
                grindHealth: Math.max(0, Number(r.grindHealth) || 0),
                maxTilt: Number(r.maxTilt) || 0,
                benched: !!r.benched,
            };
        } catch (e) { return null; }
    }

    // Which champion Champion Practice will actually bank games on. Mirrors
    // engine.doChampLab's own resolution - practiceChamp first, signature as
    // the fallback - so the tag and the activity can never name different
    // champions. The picker itself lives in the Dossier.
    function practiceChampFor(career) {
        try {
            const pl = (career && career.player) || {};
            const set = typeof pl.practiceChamp === 'string' && CHAMPION_BY_ID[pl.practiceChamp]
                ? pl.practiceChamp
                : null;
            const sig = typeof pl.champion === 'string' && CHAMPION_BY_ID[pl.champion]
                ? pl.champion
                : null;
            const id = set || sig;
            if (!id) return null;
            const def = CHAMPION_BY_ID[id];
            return { id, name: (def && def.name) || id, fallback: !set };
        } catch (e) { return null; }
    }

    // ---------------------------------------------------------------
    //  this split's meta
    //  metaFor() hands back a FROZEN, memoised object shared with the match
    //  engine, so every list is copied before it is filtered or sorted.
    // ---------------------------------------------------------------
    const META_SHOW = 5;

    function readMeta(career) {
        const out = { split: 'Spring', year: 0, strong: [], weak: [], mine: null, ok: false };
        try {
            const year = Math.floor(Number(career.time.year)) || 0;
            const split = splitForWeek(career.time.week);
            out.year = year;
            out.split = split === 'summer' ? 'Summer' : 'Spring';

            const m = metaFor(year, split);
            if (!m || typeof m !== 'object') return out;

            const role = (career.player && career.player.role) || '';
            const band = (list) => (Array.isArray(list) ? list.slice() : [])
                .map(id => CHAMPION_BY_ID[id])
                .filter(ch => ch && Array.isArray(ch.roles) && ch.roles.indexOf(role) >= 0)
                .sort((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)))
                .slice(0, META_SHOW)
                .map(ch => ({ id: ch.id, name: ch.name }));

            out.strong = band(m.strong);
            out.weak = band(m.weak);
            out.ok = true;

            const sig = career.player && career.player.champion;
            if (typeof sig === 'string' && CHAMPION_BY_ID[sig]) {
                const tier = metaTierFor(sig, year, split);
                out.mine = { name: CHAMPION_BY_ID[sig].name, tier, label: metaLabelFor(tier) };
            }
        } catch (e) { return out; }
        return out;
    }

    // ---------------------------------------------------------------
    //  derived view
    // ---------------------------------------------------------------
    $: c = $career;
    $: p = c.player;
    $: phase = $currentPhase;
    $: summary = readSummary(c, phase);
    $: fixtures = Array.isArray(summary.fixtures) ? summary.fixtures : [];
    $: nextFixture = summary.nextFixture || fixtures.find(f => !f.played) || null;
    $: playedThisWeek = fixtures.filter(f => f.played);
    $: gate = readGate(c, fixtures);
    $: blockers = normBlockers(summary.blockers);
    $: income = normIncome(summary.income);

    $: nowYear = Number.isFinite(Number(c.time && c.time.year)) ? Number(c.time.year) : 0;
    $: opponent = nextFixture ? teamById(nextFixture.opponentId) : null;
    $: oppLine = opponent ? describeTeam(opponent) : '';
    $: oppPower = oppStrengthFor(opponent, c.time.year);
    $: myPower = myStrengthFor(c);
    $: powerTotal = Math.max(1, myPower + oppPower);
    $: myTeamName = $currentTeam ? $currentTeam.name : (p.handle || 'Free Agent');
    $: myTeamAccent = $currentTeam ? $currentTeam.accent : '#22c55e';

    // The draw, but only while one is running. BracketView has its own empty
    // state; the Hub does not want it, so the panel is gated instead.
    $: liveBracket = (c.season && c.season.bracket && typeof c.season.bracket === 'object')
        ? c.season.bracket
        : null;
    // The live tournament, read off the BRACKET rather than the calendar, so a
    // player whose club did not qualify is never told they are at Worlds. Same
    // reader the Calendar banner uses; wrapped because every engine read on this
    // screen is (careerRender drives it against rotted saves).
    $: tourney = (() => { try { return tournamentNow(c); } catch (e) { return null; } })();
    // Is THIS week's game a knockout tie? The complaint this answers is that a
    // bracket match was indistinguishable from a league game, because the draw
    // sat below the whole activity board and nothing above it said "knockout".
    $: isBracketTie = !!(nextFixture && nextFixture.kind === 'bracket');
    $: bestOf = nextFixture
        ? (Number(nextFixture.bestOf) || (SERIES_PHASES.indexOf(phase.id) >= 0 ? 5 : 1))
        : 1;
    $: fixtureLabel = nextFixture
        ? (nextFixture.label || (nextFixture.kind === 'scrim' ? 'Amateur Circuit' : phase.name))
        : '';
    $: bench = nextFixture ? readBench(c) : { plays: true, reason: '' };

    $: actionsLeft = Number.isFinite(summary.actionsLeft) ? summary.actionsLeft : c.weekly.actionsLeft;
    $: actionsMax = Number.isFinite(summary.actionsMax) ? summary.actionsMax : c.weekly.actionsMax;

    // ONE gate, shared with engine.doActivity(). This used to re-derive three
    // rules inline, which meant every new rule had to be written twice or the
    // screen and the engine would disagree about what is legal.
    $: soloCost = safeSoloCost(c);
    $: practiceChamp = practiceChampFor(c);

    // THE LEVEL SYSTEM (training.js): while "Skip training minigames" is on, the
    // practice activities pay XP and 'train' is a Practice Block run right here
    // rather than a door to the minigame drills.
    $: levelMode = $skipMinigames;
    $: lv = (() => { try { return levelOf(c); } catch (e) { return { level: 1, xp: 0, need: 300, pct: 0, points: 0 }; } })();

    $: activities = ACTIVITIES.map(a => {
        // In minigame mode 'train' is legal here and routed to the Training screen
        // by runActivity, so it is gated on everything EXCEPT the engine's own
        // redirect. In the level system it is an ordinary activity.
        const g = safeGate(c, a);
        const practiceBlock = levelMode && a.id === 'train';
        return {
            act: a,
            title: practiceBlock ? 'Practice Block' : a.name,
            desc: practiceBlock
                ? 'A full block of structured practice. The most XP of any activity: level up to earn attribute points.'
                : a.desc,
            gives: practiceBlock ? [] : (ACTIVITY_GIVES[a.id] || []),
            xp: levelMode ? safeXP(c, a.id) : 0,
            disabled: !g.ok,
            reason: g.reason,
            // Both are per-row so the markup never has to test the id twice.
            cost: a.id === 'soloq' ? soloCost : null,
            practice: a.id === 'champ_lab' ? practiceChamp : null,
            namesChamp: a.id === 'champ_lab',
        };
    });

    function safeXP(career_, id) {
        try { return Math.max(0, Number(activityXP(career_, id)) || 0); } catch (e) { return 0; }
    }

    $: activityGroups = ACTIVITY_GROUPS
        .map(g => ({ ...g, rows: activities.filter(e => (e.act.group || 'practice') === g.id) }))
        .filter(g => g.rows.length);

    function safeGate(career, a) {
        try {
            const g = activityGate(career, a);
            return g && typeof g === 'object' ? g : { ok: true, reason: '' };
        } catch (e) {
            return { ok: false, reason: 'Unavailable.' };
        }
    }

    $: weekLog = (Array.isArray(c.weekly.log) ? c.weekly.log : [])
        .filter(e => e && typeof e === 'object');
    $: statusLine = safeStatusLine(c);
    $: squad = statusInfo(p.status);
    $: clubTier = p.clubTier ? CLUB_TIERS[p.clubTier] : null;
    $: scouts = p.clubId ? [] : safeInterest(c);
    $: gateProgress = Math.max(0, Math.min(1, (c.soloq.mmr || 0) / SCOUT_MMR_GATE));
    $: offers = Array.isArray(c.offers) ? c.offers : [];

    $: lastMatch = c.lastMatch || null;
    $: lastRating = lastMatch ? safeRating(lastMatch.rating) : null;
    $: lastKDA = lastMatch && lastMatch.kda
        ? fmtKDA(lastMatch.kda.k, lastMatch.kda.d, lastMatch.kda.a)
        : null;
    $: lmBoards = safeBoards(lastMatch);
    $: lmStamp = matchStamp(lastMatch);
    $: lmBoard = pickLmBoard(lmBoards, lmSel, lmStamp);
    $: lmOppName = (lastMatch && lastMatch.opponentName) || 'Opponent';

    $: table = safeTable(c);
    $: myRow = table.find(r => r.isMine) || null;

    $: meta = readMeta(c);

    $: news = (Array.isArray(c.news) ? c.news : [])
        .filter(n => n && typeof n === 'object');
    $: shownNews = showAllNews ? news.slice(0, 40) : news.slice(0, 12);

    // ---------------------------------------------------------------
    //  the club's brief (career/objectives.js) and where it leaves you
    //  Both reads are pure and wrapped: clubReview() re-runs on every
    //  render here exactly as it does on the Club screen, which is safe
    //  because it never writes -- strikes are counted by the engine only.
    // ---------------------------------------------------------------
    function safeBrief(career) {
        try { return objectiveProgress(career); } catch (e) { return null; }
    }
    function safeReview(career) {
        try {
            const r = clubReview(career);
            return r && typeof r === 'object' && r.verdict ? r : null;
        } catch (e) { return null; }
    }

    const BRIEF_STATE = {
        met:      { label: 'Met',         tone: 'good' },
        ontrack:  { label: 'On track',    tone: 'good' },
        open:     { label: 'In progress', tone: 'idle' },
        behind:   { label: 'Behind',      tone: 'bad' },
        failed:   { label: 'Failed',      tone: 'bad' },
        unjudged: { label: 'Not judged',  tone: 'idle' },
        missed:   { label: 'Missed',      tone: 'idle' },
    };
    const BRIEF_GLYPH = { table: 'ranking', rating: 'star', drills: 'target', ovr: 'trend', stretch: 'trophy' };
    const VERDICT = {
        untouchable: { label: 'Untouchable', color: '#eab308', line: 'The club are building around you.' },
        happy:       { label: 'Happy',       color: '#22c55e', line: 'You are doing the job you were signed to do.' },
        watching:    { label: 'Watching',    color: '#94a3b8', line: 'Neither impressed nor worried. Yet.' },
        concerned:   { label: 'Concerned',   color: '#f59e0b', line: 'Your minutes are under review. A warning goes on file at the split close.' },
        cutting:     { label: 'Out of patience', color: '#ef4444', line: 'Two warnings at the split close. Three and the contract is torn up.' },
    };

    $: brief = safeBrief(c);
    $: review = p.clubId ? safeReview(c) : null;
    // A verdict needs evidence. Before a few league games the review is mostly
    // "rating versus club strength", which reads as a judgement on a player who
    // has not stepped on stage yet -- so the Hub waits for a sample to show it.
    const VERDICT_MIN_GAMES = 3;
    $: leaguePlayed = (Array.isArray(c.season && c.season.schedule) ? c.season.schedule : [])
        .filter(f => f && f.played && f.kind !== 'bracket').length;
    $: verdict = review && (leaguePlayed >= VERDICT_MIN_GAMES || (brief && brief.settled))
        ? (VERDICT[review.verdict] || VERDICT.watching)
        : null;
    $: strikesOn = review ? Math.max(0, Number(review.strikes) || 0) : 0;
    $: strikesMax = review ? Math.max(1, Number(review.strikesBefore) || 3) : 3;
    $: briefBonus = brief ? brief.items.filter(i => !i.stretch).reduce((s, i) => s + (Number(i.bonus) || 0), 0) : 0;

    // ---------------------------------------------------------------
    //  the activity board: a line icon per activity, and up to two
    //  suggestions read off the player's condition and the brief, so a
    //  sixteen-card board opens on "start here" instead of a wall.
    // ---------------------------------------------------------------
    const ACT_GLYPH = {
        train: 'target', soloq: 'ranking', scrim: 'swords', champ_lab: 'sparkle', vod: 'play',
        stream: 'video', media: 'quests', gym: 'dumbbell', rest: 'moon', friends: 'coffee',
        therapy: 'heart', recover: 'bandage', fans: 'welcome', sponsorday: 'briefcase',
        coach1on1: 'chat', language: 'guide',
    };

    function suggestFor(career, rows, b) {
        const out = {};
        let n = 0;
        const pl = (career && career.player) || {};
        const usable = (id) => rows.some(r => r.act.id === id && !r.disabled);
        const add = (id, why) => {
            if (n >= 2 || out[id] || !usable(id)) return;
            out[id] = why; n++;
        };
        const v = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
        if (v(pl.health, 100) < 55) { add('recover', 'Health is low'); add('gym', 'Health is low'); }
        if (v(pl.energy, 100) < 35) add('rest', 'Energy is low');
        if (v(pl.morale, 70) < 40) { add('friends', 'Morale is low'); add('therapy', 'Morale is low'); }
        const dev = b && b.items.find(i => (i.kind === 'drills' || i.kind === 'ovr') && i.state === 'open');
        if (dev) add('train', 'Your brief');
        add('train', 'Raises your rating');
        add('scrim', 'Builds chemistry');
        return out;
    }
    $: suggested = suggestFor(c, activities, brief);

    // ---------------------------------------------------------------
    //  the week at a glance: the phase timeline, four numbers, the one
    //  thing to do next, and the things that need the player's attention.
    //  Condition (energy, health, morale, form) is not repeated here: the
    //  shell header shows all four on every career screen.
    // ---------------------------------------------------------------
    function n(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }

    $: actionsUsed = Math.max(0, actionsMax - actionsLeft);
    $: winPct = (nextFixture && opponent)
        ? (() => { try { return Math.round(winChance(myPower, oppPower) * 100); } catch (e) { return null; } })()
        : null;

    $: briefCore = brief ? brief.items.filter(i => !i.stretch) : [];
    $: briefOnTrack = briefCore.filter(i => i.state === 'met' || i.state === 'ontrack').length;
    $: heroTiles = [
        levelMode
            ? { key: 'level', icon: 'star', color: '#a78bfa', value: 'Lv ' + lv.level, label: lv.xp + '/' + lv.need + ' XP', tip: 'Your training level. Practice activities pay XP; every level pays attribute points to spend in Training.' }
            : { key: 'acts', icon: 'target', color: '#a78bfa', value: actionsLeft + '/' + actionsMax, label: 'Actions left', tip: 'Activity slots left this week. Unused slots are lost when the week ends.' },
        { key: 'rec', icon: 'swords', color: '#38bdf8', value: fmtRecord(c.season.wins, c.season.losses), label: (c.season.split === 'summer' ? 'Summer' : 'Spring') + ' record', tip: 'Series won and lost this split, playoffs included.' },
        { key: 'table', icon: 'ranking', color: '#34d399', value: myRow && myRow.rank ? ordinal(myRow.rank) : '-', label: 'League table', tip: 'Your club\'s place in its division.' },
        { key: 'brief', icon: 'flag', color: '#fbbf24', value: brief ? briefOnTrack + '/' + briefCore.length : '-', label: 'Brief on track', tip: 'Club brief objectives met or on track this split.' },
    ];

    // THE one thing to do next, as the hero's big button: play the match, then
    // spend the week's activities, then advance. A player who wants to end the
    // week early still can, from the line under it and from the sticky bar.
    $: lastWeek = n(c.time.week, 1) >= WEEKS_PER_YEAR;
    $: nextAction = (() => {
        if (nextFixture && opponent) {
            if (bench.plays) {
                return {
                    kind: 'play', icon: 'play',
                    kicker: (isBracketTie ? 'Knockout' : 'Next up') + ' - ' + fixtureLabel,
                    title: 'Play vs ' + opponent.name,
                    sub: 'Best of ' + bestOf + (winPct !== null ? ' - about ' + winPct + '% to win' : ''),
                };
            }
            return {
                kind: 'sim', icon: 'clock',
                kicker: 'Next up - ' + fixtureLabel,
                title: 'Simulate vs ' + opponent.name,
                sub: 'You are not starting this one',
            };
        }
        if (actionsLeft > 0) {
            return {
                kind: 'acts', icon: 'target',
                kicker: 'This week',
                title: 'Use your activities',
                sub: actionsLeft + ' of ' + actionsMax + ' left - train, scrim, rest or earn',
            };
        }
        return {
            kind: 'advance', icon: 'calendar',
            kicker: 'Week done',
            title: lastWeek ? 'Start the new year' : 'Advance to week ' + (n(c.time.week, 1) + 1),
            sub: gate.ok ? (income && income.total > 0 ? 'Collect ' + fmtGold(income.total) + ' gold in wages' : 'Everything is done') : (gate.reason || 'Not yet'),
            disabled: !gate.ok,
        };
    })();

    function runNext() {
        if (busy || nextAction.disabled) return;
        if (nextAction.kind === 'play') playMatch();
        else if (nextAction.kind === 'sim') simMatch();
        else if (nextAction.kind === 'acts') {
            playSound('click');
            const el = typeof document !== 'undefined' ? document.getElementById('hub-activities') : null;
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else endWeek();
    }
    $: weekPct = Math.max(0, Math.min(100, (n(c.time.week, 1) / WEEKS_PER_YEAR) * 100));
    $: yearPhases = PHASES.map(ph => ({
        ...ph,
        left: ((ph.from - 1) / WEEKS_PER_YEAR) * 100,
        width: ((ph.to - ph.from + 1) / WEEKS_PER_YEAR) * 100,
        on: ph.id === phase.id,
    }));

    $: alerts = buildAlerts(c, offers, brief, strikesOn, strikesMax, phase);

    // To-do cards: a short label and one line of detail, in the Roster Home's
    // style. `go` makes the card a link to that screen.
    function buildAlerts(career, offerList, b, strikes, strikeCap, ph) {
        const out = [];
        try {
            const pl = career.player || {};
            let bo = null, benched = false;
            try { bo = burnoutOf(career); benched = burnoutBenched(career); } catch (e) { bo = null; }
            if (benched) out.push({ tone: 'bad', icon: 'alert', label: 'Burnt out - benched', sub: 'A Rest Day, the psychologist or a day with friends gets you back.' });
            else if (bo && bo.weeks > 0) out.push({ tone: 'warn', icon: 'flame', label: 'Burnout building', sub: `${bo.weeks} week${bo.weeks === 1 ? '' : 's'} of low morale in a row. Lift it before it benches you.` });

            // Banked attribute points from the level system. First, because it is
            // the one item on this list that is pure upside.
            const pts = Math.max(0, Math.floor(n(pl.points, 0)));
            if (pts > 0) out.push({ tone: 'good', icon: 'star', label: `${pts} attribute point${pts === 1 ? '' : 's'} to spend`, sub: 'Put them into the attributes you want to raise.', go: 'training' });

            if (n(pl.energy, 100) < 25) out.push({ tone: 'bad', icon: 'bolt', label: 'Exhausted', sub: 'Under 25 energy all training pays half. Take a Rest Day.' });
            else if (n(pl.energy, 100) < 40) out.push({ tone: 'warn', icon: 'bolt', label: 'Energy getting low', sub: 'A Rest Day gives 50 back.' });
            if (n(pl.health, 100) < 55) out.push({ tone: 'warn', icon: 'heart', label: 'Health is low', sub: 'You may be left out. Gym & Physio or a Recovery Week repairs it.' });

            const offerN = Array.isArray(offerList) ? offerList.length : 0;
            if (offerN) out.push({ tone: 'info', icon: 'trade', label: `${offerN} contract offer${offerN === 1 ? '' : 's'} waiting`, sub: 'Answer them before they expire.', go: 'transfers' });
            if (!pl.clubId) out.push({ tone: 'info', icon: 'search', label: 'You are not at a club', sub: 'Win solo queue games to get noticed, and watch Transfers.', go: 'transfers' });

            if (strikes > 0) out.push({ tone: strikes >= strikeCap - 1 ? 'bad' : 'warn', icon: 'alert', label: `${strikes} of ${strikeCap} contract warnings`, sub: `One more bad review ${strikes >= strikeCap - 1 ? 'ends the contract' : 'adds another'}.`, go: 'club' });

            const behind = b && Array.isArray(b.items) ? b.items.filter(i => i.state === 'behind') : [];
            if (behind.length) out.push({ tone: 'warn', icon: 'flag', label: 'Behind on your club brief', sub: behind.map(i => i.title).join(' - ') });

            const k = pl.contract;
            if (k && pl.clubId && n(k.endYear, 9999) <= n(career.time.year, 0) && ph && ph.id === 'offseason') {
                out.push({ tone: 'warn', icon: 'clock', label: 'Contract ends this year', sub: 'Renew or move before the new season.', go: 'transfers' });
            } else if (ph && (ph.id === 'offseason' || ph.id === 'preseason') && pl.clubId) {
                out.push({ tone: 'info', icon: 'trade', label: 'Transfer window open', sub: 'Clubs can make you offers this week.', go: 'transfers' });
            }
        } catch (e) { /* an alert must never break the screen */ }
        return out.slice(0, 6);
    }
    const TONE_COLOR = { bad: '#f87171', warn: '#fbbf24', info: '#60a5fa', good: '#c4b5fd' };

    // The table, cut to what fits the rail: the top four and you.
    $: miniTable = (() => {
        const sorted = table.slice().sort((a, b2) => (a.rank || 99) - (b2.rank || 99));
        const top = sorted.slice(0, 4);
        if (myRow && !top.includes(myRow)) top.push(myRow);
        return top;
    })();

    // Amateur players are scouted on rating alone; unsigned ones on rank too.
    $: amateur = !!p.clubId && isAmateurTier(p.clubTier);
    $: myOVR = (() => { try { return calcOVR(p.attrs, p.role); } catch (e) { return 0; } })();

    // What the week is for when there is no game on the calendar.
    const GUIDANCE = {
        preseason: 'Nothing counts yet. Bank the training weeks now - attribute gains carry into the split.',
        spring: 'Regular season. Train between fixtures and keep energy above the cost of a scrim block.',
        spring_po: 'Bracket weeks. Rest, review vods, and go into the series with form high.',
        msi: 'International break. If you are not there, the ladder and the gym are how you use it.',
        summer: 'Championship points weeks. Every win here decides whether the year ends at Worlds.',
        summer_po: 'The bracket that sends a team to Worlds. Nothing else this week matters.',
        worlds: 'Worlds weeks. Watching it from home is its own kind of motivation - train.',
        offseason: 'Contracts move now. Check Transfers, take the rest days, and decide where you play next year.',
    };
    $: guidance = GUIDANCE[phase.id] || 'Spend your activity slots and advance the week.';

    // ---------------------------------------------------------------
    //  actions
    // ---------------------------------------------------------------
    function goto(screen) {
        playSound('click');
        careerScreen.set(screen);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    // A bracket tie whose other half is undecided still renders a fixture, and
    // the id on it resolves to nothing. Re-check through teamById rather than
    // trusting the panel, so a stand-in can never open a scouting report.
    function openScout(id) {
        if (!id || typeof id !== 'string') return;
        let real = false;
        try { real = !!teamById(id); } catch (e) { real = false; }
        if (!real) { showToast('That opponent has not been confirmed yet.', 'error'); return; }
        playSound('click');
        scoutId = id;
    }
    function closeScout() { scoutId = null; }

    function showLmBoard(b) {
        if (!b || !b.key) return;
        playSound('click');
        lmSel = { stamp: lmStamp, key: b.key };
    }

    function playMatch() {
        if (!nextFixture || busy) return;
        busy = true;
        playSound('click');
        try {
            const m = startFixture(nextFixture.id);
            if (!m) showToast('That fixture cannot be started right now.', 'error');
            else saveCareer();
        } catch (e) {
            showToast('That fixture cannot be started right now.', 'error');
        }
        busy = false;
    }

    function simMatch() {
        if (!nextFixture || busy) return;
        busy = true;
        try {
            const res = simFixture(nextFixture.id);
            if (!res) {
                showToast('That fixture could not be simulated.', 'error');
            } else {
                playSound(res.won ? 'win' : 'lose');
                pushOverlay('result', res);
                saveCareer();
            }
        } catch (e) {
            showToast('That fixture could not be simulated.', 'error');
        }
        busy = false;
    }

    function runActivity(entry) {
        if (busy) return;
        if (entry.disabled) { showToast(entry.reason, 'error'); return; }
        const a = entry.act;

        if (a.id === 'train' && !levelMode) { goto('training'); return; }

        busy = true;
        const before = get(career).weekly.log.length;
        let res = null;
        try { res = doActivity(a.id); } catch (e) { res = null; }
        res = res || { ok: false, msg: 'That did not work out.' };

        if (!res.ok) {
            showToast(res.msg || 'That did not work out.', 'error');
            busy = false;
            return;
        }

        playSound(a.id === 'rest' ? 'click' : 'claim');
        showToast(res.msg || (a.name + ' complete.'), 'success');

        // The engine may already have written the line; only add it when it
        // did not, so the timeline never doubles up.
        const log = get(career).weekly.log;
        const last = log[log.length - 1];
        if (res.detail && (log.length === before || !last || last.detail !== res.detail)) {
            logWeek(a.name, res.detail, a.accent);
        }

        flash = { id: a.id, text: res.detail || res.msg || '' };
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { flash = null; flashTimer = null; }, 7000);

        saveCareer();
        busy = false;
    }

    function endWeek() {
        if (busy) return;
        if (!gate.ok) { showToast(gate.reason || 'You cannot end the week yet.', 'error'); return; }
        busy = true;
        playSound('click');
        let res = null;
        try { res = advanceWeek(); } catch (e) { res = null; }
        res = res || {};

        // EVERY entry, in order. A week can now hand back two weekly events and
        // a pre-game one on top; reading events[0] threw the rest away, which is
        // what made the whole pre-game pool invisible from this button.
        const evs = Array.isArray(res.events)
            ? res.events
            : (res.events ? [res.events] : (res.event ? [res.event] : []));
        // pushOverlay, not set: rolling the week can already have raised a split
        // awards panel or a trait reveal, and the weekly events land last. The
        // queue is what keeps a second event from clobbering the first.
        for (const ev of evs) if (ev) pushOverlay('event', ev);

        if (res.yearRolled) showToast('A new competitive year begins.', 'info');
        else if (res.phaseChanged) showToast('New phase: ' + $currentPhase.name + '.', 'info');

        flash = null;
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
        saveCareer();
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
        busy = false;
    }

    function newsAccent(type) {
        return (NEWS_TYPES[type] || NEWS_TYPES.system).accent;
    }
    function newsLabel(type) {
        return (NEWS_TYPES[type] || NEWS_TYPES.system).label;
    }
    function pct(v) { return Math.round(Math.max(0, Math.min(1, v)) * 100); }
</script>

<!-- ============ THE WEEK AT A GLANCE ============
     Laid out like the Ultimate Roster home: the phase and the year on the
     left, four numbers in the middle, and ONE big button for the next thing
     to do. Condition lives in the shell header, so it is not repeated here. -->
<div class="hub-page" style="--hc:{myTeamAccent}; --ph:{phase.accent}">

<section class="hh" aria-label="This week">
    <div class="hh-glow" aria-hidden="true"></div>
    <div class="hh-when">
        <span class="hh-k"><Icon name="calendar" size={12} stroke={2.4} /> Week {c.time.week} of {WEEKS_PER_YEAR} &middot; {c.time.year}</span>
        <h1 class="hh-title">{phase.name}</h1>
        <p class="hh-desc">{phase.desc}</p>
        <div class="year" aria-hidden="true">
            {#each yearPhases as ph (ph.id)}
                <span class="yr-seg" class:yr-on={ph.on} style="left:{ph.left}%; width:{ph.width}%; --c:{ph.accent}" title="{ph.name}: weeks {ph.from}-{ph.to}"></span>
            {/each}
            <span class="yr-now" style="left:{weekPct}%"></span>
        </div>
    </div>

    <div class="hh-stats" role="group" aria-label="This week in numbers">
        {#each heroTiles as t (t.key)}
            <div class="hs" style="--c:{t.color}" title={t.tip}>
                <span class="hs-ico"><Icon name={t.icon} size={16} /></span>
                <span class="hs-val">{t.value}</span>
                <span class="hs-lbl">{t.label}</span>
            </div>
        {/each}
    </div>

    <div class="hh-act">
        <button
            class="cta"
            class:cta-gold={nextAction.kind === 'advance'}
            class:cta-ko={nextAction.kind === 'play' && isBracketTie}
            on:click={runNext}
            disabled={busy || nextAction.disabled}
        >
            <span class="cta-ico"><Icon name={nextAction.icon} size={22} stroke={2.2} /></span>
            <span class="cta-t">
                <span class="cta-k">{nextAction.kicker}</span>
                <span class="cta-h">{nextAction.title}</span>
                <span class="cta-s">{nextAction.sub}</span>
            </span>
            <span class="cta-arrow" aria-hidden="true"><Icon name="arrow" size={18} stroke={2.4} /></span>
        </button>
        {#if nextAction.kind !== 'advance' && gate.ok}
            <button class="cta-alt" on:click={endWeek} disabled={busy}>
                or end the week now{#if actionsLeft > 0}&nbsp;({actionsLeft} slot{actionsLeft === 1 ? '' : 's'} unused){/if}
            </button>
        {/if}
    </div>
</section>

<!-- ============ TO DO ============ -->
{#if alerts.length}
    <section class="panel todo-panel" aria-labelledby="hub-todo">
        <div class="ph">
            <h2 class="ph-title" id="hub-todo"><Icon name="alert" size={14} stroke={2.2} /> Needs your attention</h2>
            <span class="ph-note">{alerts.length} thing{alerts.length === 1 ? '' : 's'}</span>
        </div>
        <div class="todo">
            {#each alerts as a, i (i + a.label)}
                {#if a.go}
                    <button class="td" style="--c:{TONE_COLOR[a.tone] || '#60a5fa'}" on:click={() => goto(a.go)}>
                        <span class="td-ico"><Icon name={a.icon} size={17} stroke={2.1} /></span>
                        <span class="td-text">
                            <span class="td-label">{a.label}</span>
                            <span class="td-sub">{a.sub}</span>
                        </span>
                        <Icon name="chevron" size={15} stroke={2.4} />
                    </button>
                {:else}
                    <div class="td td-static" style="--c:{TONE_COLOR[a.tone] || '#60a5fa'}">
                        <span class="td-ico"><Icon name={a.icon} size={17} stroke={2.1} /></span>
                        <span class="td-text">
                            <span class="td-label">{a.label}</span>
                            <span class="td-sub">{a.sub}</span>
                        </span>
                    </div>
                {/if}
            {/each}
        </div>
    </section>
{/if}

<div class="hub">
    <!-- ============ MAIN COLUMN: what you do ============ -->
    <div class="col main">

        <!-- ---------- TOURNAMENT BANNER ----------
             FIRST thing in the column, and only while the player's own club is
             actually in a live bracket. It reads the BRACKET, not the calendar,
             so a club that did not qualify never sees it. A knockout week used to
             be indistinguishable from a league week on this screen. -->
        {#if tourney}
            <div class="tbanner" class:tb-done={tourney.done} style="--a:{tourney.accent}">
                <div class="tb-mark" aria-hidden="true">
                    <span class="tb-pulse"></span>
                    <span class="tb-cup"><Icon name="trophy" size={20} /></span>
                </div>
                <div class="tb-body">
                    <div class="tb-top">
                        <span class="tb-title">{tourney.title}</span>
                        {#if !tourney.done}
                            <span class="tb-round">{tourney.round}</span>
                            <span class="tb-of">Round {tourney.roundIndex} of {tourney.totalRounds}</span>
                            <span class="tb-bo">Best of {tourney.bestOf}</span>
                        {:else if tourney.placement === 1}
                            <span class="tb-round tb-win">Champions</span>
                        {:else if tourney.placement === 2}
                            <span class="tb-round">Runners-up</span>
                        {:else if tourney.placement}
                            <span class="tb-round">Finished {tourney.placement}{tourney.placement === 3 ? 'rd' : 'th'}</span>
                        {:else}
                            <span class="tb-round">Eliminated</span>
                        {/if}
                    </div>
                    <div class="tb-sub">
                        {#if tourney.done}
                            The bracket is decided.
                        {:else}
                            <span class="tb-vs">vs</span>
                            <span class="tb-opp" style="--o:{tourney.opponentAccent}">{tourney.opponent}</span>
                            <span class="tb-when">&middot; final on week {tourney.lastWeek}</span>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <!-- ---------- NEXT MATCH ---------- -->
        <section class="panel next" class:next-ko={isBracketTie} aria-labelledby="hub-next">
            <div class="ph">
                <h2 class="ph-title" id="hub-next"><Icon name="swords" size={14} stroke={2.2} /> {nextFixture && opponent ? 'Next match' : 'This week'}</h2>
                <span class="phase-pill" style="--ph:{phase.accent}">Week {c.time.week} &middot; {phase.name}</span>
            </div>

            {#if nextFixture && opponent}
                <div class="fx">
                    <div class="fx-left">
                        <div class="fx-meta">
                            {#if isBracketTie}
                                <!-- A knockout tie is not a league game and must not
                                     read like one: lose it and the run is over. -->
                                <span class="fx-ko">Knockout</span>
                            {/if}
                            <span class="fx-tag" style="--a:{opponent.accent}">{fixtureLabel}</span>
                            <span class="fx-bo">Best of {bestOf}</span>
                            <span class="fx-side">{nextFixture.home ? 'Home' : 'Away'}</span>
                        </div>
                        <div class="fx-name" style="--a:{opponent.accent}">
                            <span class="fx-dot"></span>
                            <span class="fx-opp">{opponent.name}</span>
                        </div>
                        <p class="fx-desc">{oppLine}</p>
                        {#if opponent.id}
                            <button class="ph-link scoutbtn" on:click={() => openScout(opponent.id)} aria-label="Scout {opponent.name}">
                                Scout their roster <Icon name="chevron" size={13} stroke={2.4} />
                            </button>
                        {/if}
                    </div>

                    <div class="fx-vs" role="group" aria-label="Team strength">
                        <div class="fx-pw">
                            <span class="fx-pw-n" style="color:{myTeamAccent}">{myPower}</span>
                            <span class="fx-pw-l" title={myTeamName}>You</span>
                        </div>
                        <span class="fx-x">vs</span>
                        <div class="fx-pw">
                            <span class="fx-pw-n" style="color:{opponent.accent}">{oppPower}</span>
                            <span class="fx-pw-l">Them</span>
                        </div>
                    </div>

                    <div class="fx-right">
                        {#if winPct !== null}
                            <div class="odds">
                                <span class="odds-n" class:odds-good={winPct >= 55} class:odds-bad={winPct <= 45}>{winPct}%</span>
                                <span class="odds-l">to win on team strength</span>
                                <div class="odds-bar"><div style="width:{winPct}%"></div></div>
                            </div>
                        {/if}
                        {#if !bench.plays}
                            <div class="benched" role="status">
                                <span class="benched-t">You are not starting this game.</span>
                                <span class="benched-d">{bench.reason}</span>
                            </div>
                            <button class="btn-play btn-ghost" on:click={simMatch} disabled={busy}>Simulate from the bench</button>
                        {:else}
                            <button class="btn-play" on:click={playMatch} disabled={busy}><Icon name="play" size={14} stroke={2.4} /> Play match</button>
                            <button class="btn-play btn-ghost" on:click={simMatch} disabled={busy}>Simulate</button>
                        {/if}
                    </div>
                </div>
                <p class="fx-note">How you play decides the rest: your decisions in the match are about a third of the result.</p>

            {:else}
                <div class="nofx">
                    <span class="nofx-ico" style="--c:{phase.accent}"><Icon name={playedThisWeek.length ? 'check' : 'calendar'} size={20} /></span>
                    <div class="nofx-t">
                        <span class="nofx-h">{playedThisWeek.length ? 'Match played' : 'No match this week'} <span class="nofx-weeks">{phase.from === phase.to ? 'Week ' + phase.from : 'Weeks ' + phase.from + '-' + phase.to}</span></span>
                        <span class="nofx-s">{guidance}</span>
                        {#if playedThisWeek.length}
                            <span class="nofx-done">{playedThisWeek.length} fixture{playedThisWeek.length === 1 ? '' : 's'} already played this week.</span>
                        {/if}
                    </div>
                </div>
            {/if}
        </section>

        <!-- ---------- BRACKET ----------
             Only while one is running. It sits ABOVE the activity board on
             purpose: below it, the draw went unread in the one week it matters.
             Anything added to this column belongs BELOW this panel. -->
        {#if liveBracket}
            <section class="panel" aria-labelledby="hub-bracket">
                <div class="ph">
                    <h2 class="ph-title" id="hub-bracket"><Icon name="trophy" size={14} stroke={2.2} /> Bracket</h2>
                    <span class="ph-note">{phase.name}</span>
                </div>
                <BracketView
                    bracket={liveBracket}
                    myId={p.clubId}
                    myName={myTeamName}
                    myAccent={myTeamAccent}
                    accent={phase.accent || '#a78bfa'}
                    showHead={true}
                />
            </section>
        {/if}

        <!-- ---------- ACTIVITIES ----------
             Every activity, every group, always on screen: grouped, never
             tabbed. Up to two are tagged Suggested off condition and the brief. -->
        <section class="panel board" id="hub-activities" aria-labelledby="hub-week">
            <div class="ph">
                <h2 class="ph-title" id="hub-week"><Icon name="target" size={14} stroke={2.2} /> Activities</h2>
                <span class="slots" title="Activity slots left this week">
                    <span class="slots-pips" aria-hidden="true">
                        {#each Array(Math.max(0, Math.min(8, actionsMax))) as _, i}<span class="spip" class:spip-on={i >= actionsUsed}></span>{/each}
                    </span>
                    <span class="slots-n">{actionsLeft}</span>
                    <span class="slots-l">of {actionsMax} left</span>
                </span>
            </div>
            <p class="board-how">Each activity uses one slot and some energy. Slots you do not use are lost when the week ends.</p>

            {#each activityGroups as grp (grp.id)}
                <div class="act-group">
                    <div class="ag-head">
                        <span class="ag-name">{grp.name}</span>
                        <span class="ag-blurb">{grp.blurb}</span>
                    </div>
                    <div class="acts">
                        {#each grp.rows as entry (entry.act.id)}
                            {@const a = entry.act}
                            <button
                                class="act"
                                class:act-off={entry.disabled}
                                class:act-flash={flash && flash.id === a.id}
                                class:act-sugg={!entry.disabled && suggested[a.id]}
                                style="--a:{a.accent}"
                                on:click={() => runActivity(entry)}
                                disabled={entry.disabled || busy}
                                aria-label="{entry.title} - {entry.disabled ? entry.reason : entry.desc}"
                            >
                                <span class="act-top">
                                    <span class="act-ico" aria-hidden="true">
                                        {#if ACT_GLYPH[a.id]}<Icon name={ACT_GLYPH[a.id]} size={17} stroke={2} />{:else}{a.icon}{/if}
                                    </span>
                                    <span class="act-head">
                                        <span class="act-name">{entry.title}</span>
                                        {#if !entry.disabled && suggested[a.id]}
                                            <span class="act-sugg-tag"><Icon name="sparkle" size={10} stroke={2.4} /> {suggested[a.id]}</span>
                                        {/if}
                                    </span>
                                    <span class="act-cost" class:gain={a.energy < 0}>
                                        {a.energy < 0 ? '+' + Math.abs(a.energy) : '-' + a.energy} EN
                                    </span>
                                </span>
                                <span class="act-desc">{entry.desc}</span>
                                {#if entry.xp > 0 || entry.gives.length}
                                    <span class="act-gives">
                                        {#if entry.xp > 0}<span class="give give-xp">+{entry.xp} XP</span>{/if}
                                        {#each entry.gives as g (g.t)}
                                            <span class="give" class:give-down={g.down}>{g.down ? '-' : '+'} {g.t}</span>
                                        {/each}
                                    </span>
                                {/if}
                                <span class="act-tags">
                                    {#if a.gold}<span class="act-tag act-tag-gold">{a.gold} gold</span>{/if}
                                    {#if a.once}<span class="act-tag">once a week</span>{/if}
                                    {#if a.minAge}<span class="act-tag">{a.minAge}+</span>{/if}
                                    <!-- The repeat cost of solo queue, previewed before the click.
                                         The grind number is the REPEAT charge only - a session also
                                         takes the ordinary injury roll on top. During a burnout bench
                                         the engine suppresses the morale half, so the tilt tag goes too. -->
                                    {#if entry.cost && entry.cost.grindHealth > 0}
                                        <span class="act-tag act-tag-warn">repeat costs {Math.round(entry.cost.grindHealth)} health</span>
                                    {/if}
                                    {#if entry.cost && entry.cost.maxTilt !== 0 && !entry.cost.benched}
                                        <span class="act-tag act-tag-warn">losing costs {Math.abs(Math.round(entry.cost.maxTilt))} more morale</span>
                                    {/if}
                                    {#if entry.namesChamp}
                                        {#if entry.practice}
                                            <span class="act-tag">
                                                {entry.practice.fallback
                                                    ? entry.practice.name + ' - your signature, by default'
                                                    : 'practising ' + entry.practice.name}
                                            </span>
                                        {:else}
                                            <span class="act-tag act-tag-warn">no champion to practise</span>
                                        {/if}
                                    {/if}
                                </span>
                                {#if entry.disabled}
                                    <span class="act-block">{entry.reason}</span>
                                {:else if a.id === 'train' && !levelMode}
                                    <span class="act-go">Opens the training room <Icon name="arrow" size={12} stroke={2.4} /></span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}

            {#if flash}
                <div class="flash" role="status"><Icon name="check" size={14} stroke={2.6} /> {flash.text}</div>
            {/if}
        </section>

        <!-- ---------- WEEK LOG ---------- -->
        <section class="panel" aria-labelledby="hub-log">
            <div class="ph">
                <h2 class="ph-title" id="hub-log"><Icon name="clock" size={14} stroke={2.2} /> This week so far</h2>
                <span class="ph-note">{weekLog.length} entr{weekLog.length === 1 ? 'y' : 'ies'}</span>
            </div>

            {#if weekLog.length}
                <ol class="tl">
                    {#each weekLog as entry (entry.id)}
                        <li class="tl-item" style="--a:{entry.accent || '#3b82f6'}">
                            <span class="tl-dot" aria-hidden="true"></span>
                            <div class="tl-body">
                                <span class="tl-label">{entry.label}</span>
                                {#if entry.detail}<span class="tl-detail">{entry.detail}</span>{/if}
                            </div>
                        </li>
                    {/each}
                </ol>
            {:else}
                <p class="empty">Nothing yet. Every activity you spend shows up here.</p>
            {/if}
        </section>

        <!-- ---------- ADVANCE ----------
             Sticky to the bottom of the viewport while the column runs past it,
             so ending the week never means scrolling past the whole board. -->
        <section class="adv" aria-labelledby="hub-adv">
            <div class="adv-txt">
                <h2 class="adv-h" id="hub-adv">{lastWeek ? 'End of the year' : 'End week ' + c.time.week}</h2>
                {#if gate.ok}
                    <p class="adv-line">
                        {lastWeek ? 'Roll into the new year' : 'Move to week ' + (c.time.week + 1)}{#if income && income.total > 0}, collecting {fmtGold(income.total)} gold{/if}.
                        {#if actionsLeft > 0}<span class="adv-warn">{actionsLeft} unused slot{actionsLeft === 1 ? '' : 's'} will be lost.</span>{/if}
                    </p>
                {:else}
                    <p class="adv-line adv-block">{gate.reason || 'You cannot end the week yet.'}</p>
                    {#each blockers.filter(b => b !== gate.reason) as b}
                        <p class="adv-line adv-warn">{b}</p>
                    {/each}
                {/if}
            </div>
            <button class="advbtn" on:click={endWeek} disabled={!gate.ok || busy} aria-label="Advance to the next week">
                Advance week <Icon name="arrow" size={15} stroke={2.4} />
            </button>
        </section>
    </div>

    <!-- ============ SIDE COLUMN: where you stand ============ -->
    <div class="col side">

        <!-- ---------- THE CLUB'S BRIEF ---------- -->
        {#if brief}
            <section class="panel brief" aria-labelledby="hub-brief">
                <div class="ph">
                    <h2 class="ph-title" id="hub-brief"><Icon name="flag" size={14} stroke={2.2} /> Club brief</h2>
                    <span class="ph-note">{brief.split === 'summer' ? 'Summer' : 'Spring'} {brief.year}</span>
                </div>

                {#if verdict}
                    <div class="verdict" style="--v:{verdict.color}" title="The club's verdict if the split ended today">
                        <span class="verdict-k">Verdict now</span>
                        <span class="verdict-v">{verdict.label}</span>
                    </div>
                {:else if review}
                    <div class="verdict" style="--v:#64748b" title="The club judges you once there are games to judge">
                        <span class="verdict-k">Verdict</span>
                        <span class="verdict-v">After {VERDICT_MIN_GAMES} games</span>
                    </div>
                {/if}

                <ul class="obj-list">
                    {#each brief.items as it (it.id)}
                        {@const st = BRIEF_STATE[it.state] || BRIEF_STATE.open}
                        <li class="obj obj-{st.tone}" class:obj-stretch={it.stretch}>
                            <span class="obj-ico"><Icon name={BRIEF_GLYPH[it.kind] || 'flag'} size={15} stroke={2} /></span>
                            <div class="obj-main">
                                <div class="obj-top">
                                    <span class="obj-group">{it.group}</span>
                                    <span class="obj-state">{st.label}</span>
                                </div>
                                <span class="obj-title">{it.title}</span>
                                <div class="obj-bar"><span class="obj-fill" style="width:{Math.round(Math.max(0, Math.min(1, it.progress)) * 100)}%"></span></div>
                                <span class="obj-detail">{it.detail}{#if it.bonus > 0}<b class="obj-bonus">+{fmtGold(it.bonus)} gold</b>{/if}</span>
                            </div>
                        </li>
                    {/each}
                </ul>

                <div class="brief-foot">
                    {#if brief.settled}
                        <span>Settled: {brief.met} met{brief.failed ? ', ' + brief.failed + ' failed' : ''}. A new brief arrives with the next split.</span>
                    {:else}
                        <span>Meet all {brief.coreTotal} for {fmtGold(Math.round(briefBonus * (1 + CLEAN_SWEEP_MULT)))} gold. Each one missed costs morale and counts against you in the split review.</span>
                    {/if}
                    {#if review}
                        <span class="strikes" class:strikes-on={strikesOn > 0} title="Warnings on your contract file">
                            {#each Array(strikesMax) as _, i}<span class="strike" class:strike-on={i < strikesOn}></span>{/each}
                            {strikesOn} of {strikesMax} warnings
                        </span>
                    {/if}
                </div>
                {#if verdict && review && (review.verdict === 'concerned' || review.verdict === 'cutting')}
                    <p class="brief-alarm" style="--v:{verdict.color}"><Icon name="alert" size={14} stroke={2.2} /> {verdict.line}</p>
                {/if}
            </section>
        {/if}

        <!-- ---------- CONTRACT / SCOUTING ---------- -->
        {#if p.clubId}
            <section class="panel" aria-labelledby="hub-contract">
                <div class="ph">
                    <h2 class="ph-title" id="hub-contract"><Icon name="briefcase" size={14} stroke={2.2} /> Contract</h2>
                    <span class="stat-chip" style="--a:{squad.accent}">{squad.name}</span>
                </div>
                <p class="ct-line">{statusLine}</p>
                {#if clubTier}
                    <span class="ct-tier" style="--a:{clubTier.accent}">{clubTier.name}</span>
                {/if}

                <div class="meter-row">
                    <div class="meter-top">
                        <span class="meter-lbl">Chemistry</span>
                        <span class="meter-val">{Math.round(p.chemistry)}</span>
                    </div>
                    <div class="meter-bar"><div class="meter-fill" style="width:{pct(p.chemistry / 100)}%"></div></div>
                    <span class="meter-note">
                        {#if p.chemistry >= 75}The room trusts you.
                        {:else if p.chemistry >= 50}Working relationship, nothing more.
                        {:else if p.chemistry >= 30}Scrims are quiet. Not in a good way.
                        {:else}The roster has stopped covering for you.{/if}
                    </span>
                </div>

                <!-- An amateur side is a stepping stone: the number that matters
                     is how close the academies are to calling. -->
                {#if amateur}
                    <div class="meter-row">
                        <div class="meter-top">
                            <span class="meter-lbl">Academy scouts</span>
                            <span class="meter-val">{myOVR} / {ACADEMY_SCOUT_OVR}</span>
                        </div>
                        <div class="meter-bar"><div class="meter-fill scout" style="width:{pct(myOVR / ACADEMY_SCOUT_OVR)}%"></div></div>
                        <span class="meter-note">
                            {#if myOVR >= ACADEMY_SCOUT_OVR}Academies are watching. Offers can arrive any week, and leaving an amateur side is free.
                            {:else}Academies start calling amateur players at {ACADEMY_SCOUT_OVR} overall. Training is how you get there.{/if}
                        </span>
                    </div>
                {/if}

                <div class="side-btns">
                    <button class="btn-soft" on:click={() => goto('club')}>Open club</button>
                    <button class="btn-soft" class:btn-soft-live={offers.length > 0} on:click={() => goto('transfers')}>
                        Offers{#if offers.length} <span class="off-n">{offers.length}</span>{/if}
                    </button>
                </div>
            </section>
        {:else}
            <section class="panel" aria-labelledby="hub-scout">
                <div class="ph">
                    <h2 class="ph-title" id="hub-scout"><Icon name="search" size={14} stroke={2.2} /> Scouting</h2>
                    <span class="stat-chip" style="--a:{$soloRank.color}">{$soloRank.label}</span>
                </div>
                <p class="ct-line">{statusLine}</p>

                <div class="meter-row">
                    <div class="meter-top">
                        <span class="meter-lbl">Scout radar</span>
                        <span class="meter-val">{c.soloq.mmr} / {SCOUT_MMR_GATE}</span>
                    </div>
                    <div class="meter-bar"><div class="meter-fill scout" style="width:{pct(gateProgress)}%"></div></div>
                    <span class="meter-note">
                        {#if c.soloq.mmr >= SCOUT_MMR_GATE}
                            You are on the radar. Keep the ladder climbing and offers will follow.
                        {:else}
                            Scouts start watching at Diamond IV. Grind solo queue to get seen.
                        {/if}
                    </span>
                </div>

                <div class="scout-list">
                    <div class="scout-head">
                        <span class="scout-n">{scouts.length}</span>
                        <span class="scout-l">club{scouts.length === 1 ? '' : 's'} watching</span>
                    </div>
                    {#if scouts.length}
                        {#each scouts as row (row.team.id)}
                            <div class="scout-row" style="--a:{row.team.accent}">
                                <span class="scout-team">{row.team.name}</span>
                                <span class="scout-int">{row.interest}</span>
                            </div>
                        {/each}
                    {:else}
                        <p class="empty small">Nobody is watching yet. Rating and rank are what put you on a list.</p>
                    {/if}
                </div>

                <div class="side-btns">
                    <button class="btn-soft" class:btn-soft-live={offers.length > 0} on:click={() => goto('transfers')}>
                        Transfers{#if offers.length} <span class="off-n">{offers.length}</span>{/if}
                    </button>
                </div>
            </section>
        {/if}

        <!-- ---------- SEASON ---------- -->
        <section class="panel" aria-labelledby="hub-season">
            <div class="ph">
                <h2 class="ph-title" id="hub-season"><Icon name="ranking" size={14} stroke={2.2} /> Season</h2>
                <button class="ph-link" on:click={() => goto('calendar')}>Full season <Icon name="chevron" size={13} stroke={2.4} /></button>
            </div>

            <div class="sn-grid">
                <div class="sn-cell">
                    <span class="sn-v">{fmtRecord(c.season.wins, c.season.losses)}</span>
                    <span class="sn-k">Record</span>
                </div>
                <div class="sn-cell">
                    <span class="sn-v">{(c.season.gameWins || 0) + (c.season.gameLosses || 0)}</span>
                    <span class="sn-k">Games</span>
                </div>
                <div class="sn-cell">
                    <span class="sn-v gold">{c.season.champPoints || 0}</span>
                    <span class="sn-k">Champ pts</span>
                </div>
            </div>

            {#if myRow}
                <!-- The table, cut to the top four and you. -->
                <ol class="mt">
                    {#each miniTable as r (r.team.id)}
                        <li class="mt-row" class:mt-me={r.isMine} style="--a:{r.team.accent}">
                            <span class="mt-rank">{r.rank || '-'}</span>
                            <span class="mt-team">{r.team.name}</span>
                            <span class="mt-rec">{r.w}&#8211;{r.l}</span>
                        </li>
                    {/each}
                </ol>
                <span class="sn-note">
                    {#if myRow.rank <= 1}Top of the table. Everyone is measuring themselves against you.
                    {:else if myRow.rank <= 6}Inside the playoff cut with {table.length - myRow.rank} team{table.length - myRow.rank === 1 ? '' : 's'} below you.
                    {:else}Outside the top six. That has to change before the split ends.{/if}
                </span>
            {:else}
                <p class="empty small">No division table yet. It appears once your season is generated.</p>
            {/if}
        </section>

        <!-- ---------- LAST MATCH ---------- -->
        <section class="panel" aria-labelledby="hub-last">
            <div class="ph">
                <h2 class="ph-title" id="hub-last"><Icon name="swords" size={14} stroke={2.2} /> Last match</h2>
                {#if lastMatch}
                    <span class="ph-note">W{lastMatch.week ?? c.time.week} &middot; {lastMatch.year ?? c.time.year}</span>
                {/if}
            </div>

            {#if lastMatch}
                <div class="lm" class:lm-win={lastMatch.won} class:lm-loss={!lastMatch.won}>
                    <div class="lm-top">
                        <span class="lm-res">{lastMatch.won ? 'WIN' : 'LOSS'}</span>
                        <span class="lm-score">{(lastMatch.score && lastMatch.score[0]) || 0}&#8211;{(lastMatch.score && lastMatch.score[1]) || 0}</span>
                        <span class="lm-opp">vs {lastMatch.opponentName || 'Unknown'}</span>
                    </div>

                    {#if lastMatch.played === false}
                        <p class="lm-bench">{lastMatch.benchReason || 'You did not play in this one.'}</p>
                    {:else}
                        <div class="lm-stats">
                            <div class="lm-cell"><span class="lm-v">{lastKDA ? lastKDA.line : '0/0/0'}</span><span class="lm-k">KDA</span></div>
                            <div class="lm-cell"><span class="lm-v">{lastKDA ? lastKDA.ratio.toFixed(2) : '0.00'}</span><span class="lm-k">Ratio</span></div>
                            <div class="lm-cell"><span class="lm-v">{Math.round(lastMatch.cs || 0)}</span><span class="lm-k">CS</span></div>
                            <div class="lm-cell"><span class="lm-v" style="color:{lastRating.color}">{lastRating.label}</span><span class="lm-k">Rating</span></div>
                        </div>
                        {#if lastMatch.mvp}
                            <div class="lm-mvp">Player of the Game</div>
                        {/if}
                    {/if}

                    {#if lastMatch.headline}
                        <p class="lm-head">&ldquo;{lastMatch.headline}&rdquo;</p>
                    {/if}
                </div>

                <!-- ---------- THE SCOREBOARD ----------
                     The same ten seats the result screen shows. Renders ONLY when
                     a board survives the normaliser (a benched game and any result
                     saved before boards existed have none). A series is one board
                     PER GAME, and the tabs open on the decider. -->
                {#if lmBoard}
                    <div class="lmb">
                        {#if lmBoards.length > 1}
                            <div class="lmb-tabs" role="group" aria-label="Games in the last series">
                                {#each lmBoards as b (b.key)}
                                    <button
                                        class="lmb-tab"
                                        class:lmb-on={b.key === lmBoard.key}
                                        class:lmb-won={b.won}
                                        aria-pressed={b.key === lmBoard.key}
                                        aria-label="Game {b.number}, {b.won ? 'won' : 'lost'}"
                                        on:click={() => showLmBoard(b)}
                                    >
                                        <span class="lmb-tab-n">G{b.number}</span>
                                        <span class="lmb-tab-r">{b.won ? 'W' : 'L'}</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}

                        <div class="lmb-cap">
                            Game {lmBoard.number}
                            {#if lmBoards.length > 1}<span class="lmb-dot">&middot;</span>of {lmBoards.length}{/if}
                            {#if lmBoard.mins}<span class="lmb-dot">&middot;</span>{lmBoard.mins} min{/if}
                        </div>

                        {#key lmBoard.key}
                            <div class="lmb-side" class:lmb-side-win={lmBoard.won}>
                                <div class="lmb-head">
                                    <span class="lmb-team">{myTeamName}</span>
                                    <span class="lmb-verdict">{lmBoard.won ? 'Win' : 'Loss'}</span>
                                </div>
                                {#each lmBoard.ally as r (r.key)}
                                    <div class="lmb-row" class:lmb-me={r.me}>
                                        <span class="lmb-role" title={r.roleName}>{r.role}</span>
                                        <span class="lmb-who">
                                            <span class="lmb-nm">{r.name}</span>
                                            {#if r.me}<span class="lmb-you">You</span>{/if}
                                            {#if r.champ}<span class="lmb-champ">{r.champ}</span>{/if}
                                        </span>
                                        <span class="lmb-kda">{r.k}/{r.d}/{r.a}</span>
                                    </div>
                                {/each}
                            </div>

                            <div class="lmb-side" class:lmb-side-win={!lmBoard.won}>
                                <div class="lmb-head">
                                    <span class="lmb-team">{lmOppName}</span>
                                    <span class="lmb-verdict">{lmBoard.won ? 'Loss' : 'Win'}</span>
                                </div>
                                {#each lmBoard.enemy as r (r.key)}
                                    <div class="lmb-row">
                                        <span class="lmb-role" title={r.roleName}>{r.role}</span>
                                        <span class="lmb-who">
                                            <span class="lmb-nm">{r.name}</span>
                                            {#if r.champ}<span class="lmb-champ">{r.champ}</span>{/if}
                                        </span>
                                        <span class="lmb-kda">{r.k}/{r.d}/{r.a}</span>
                                    </div>
                                {/each}
                            </div>
                        {/key}
                    </div>
                {/if}
            {:else}
                <p class="empty">No competitive game yet. Your first result lands here.</p>
            {/if}
        </section>

        <!-- ---------- SPLIT META ----------
             The draft reads it in champion select; the player plans around it
             from here. Own role only. -->
        <section class="panel" aria-labelledby="hub-meta">
            <div class="ph">
                <h2 class="ph-title" id="hub-meta"><Icon name="trend" size={14} stroke={2.2} /> Split meta</h2>
                <span class="ph-note">{meta.split} {meta.year}</span>
            </div>

            {#if meta.mine}
                <div class="meta-mine" class:meta-strong={meta.mine.tier > 0} class:meta-weak={meta.mine.tier < 0}>
                    <span class="meta-mine-k">Your signature</span>
                    <span class="meta-mine-n">{meta.mine.name}</span>
                    <span class="meta-mine-t">{meta.mine.label}</span>
                </div>
            {/if}

            {#if meta.ok && (meta.strong.length || meta.weak.length)}
                <div class="meta-band">
                    <span class="meta-k meta-strong">Strong</span>
                    <span class="meta-list">
                        {#each meta.strong as ch (ch.id)}
                            <span class="meta-ch">{ch.name}</span>
                        {:else}
                            <span class="meta-ch meta-nil">nothing in your role</span>
                        {/each}
                    </span>
                </div>
                <div class="meta-band">
                    <span class="meta-k meta-weak">Weak</span>
                    <span class="meta-list">
                        {#each meta.weak as ch (ch.id)}
                            <span class="meta-ch">{ch.name}</span>
                        {:else}
                            <span class="meta-ch meta-nil">nothing in your role</span>
                        {/each}
                    </span>
                </div>
                <span class="meta-note">The meta redraws every split. A strong pick swings a game your way, a weak one works against you.</span>
            {:else}
                <p class="empty small">No meta read for your role yet. It appears once your player is created.</p>
            {/if}
        </section>

        <!-- ---------- NEWS ---------- -->
        <section class="panel" aria-labelledby="hub-news">
            <div class="ph">
                <h2 class="ph-title" id="hub-news"><Icon name="globe" size={14} stroke={2.2} /> News</h2>
                {#if news.length > 12}
                    <button class="ph-link" on:click={() => { showAllNews = !showAllNews; }}>
                        {showAllNews ? 'Show less' : 'Show all (' + news.length + ')'}
                    </button>
                {/if}
            </div>

            {#if news.length}
                <ul class="feed">
                    {#each shownNews as n (n.id)}
                        <li class="feed-item" style="--a:{newsAccent(n.type)}">
                            <div class="feed-top">
                                <span class="feed-type">{newsLabel(n.type)}</span>
                                <span class="feed-when">W{n.week ?? c.time.week} &middot; {n.year ?? c.time.year}</span>
                            </div>
                            {#if n.text}<p class="feed-txt">{n.text}</p>{/if}
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="empty">The feed is quiet. Results, transfers and awards all report here.</p>
            {/if}
        </section>
    </div>
</div>
</div>

<!-- ---------- OPPONENT SCOUTING ----------
     A component-local dialog, not a screen: reading the other side's roster
     should not cost the player their place on the week board. -->
{#if scoutId}
    <ClubScout teamId={scoutId} year={nowYear} onClose={closeScout} />
{/if}

<style>
    /* Laid out and styled after the Ultimate Roster home (tabs/Home.svelte):
       a gradient hero, panels with an icon + uppercase title, to-do cards, and
       body text at readable contrast. --hc is the player's club accent, --ph the
       phase accent. */
    .hub-page { display: flex; flex-direction: column; gap: 16px; padding-bottom: 30px; }

    /* ===================== HERO ===================== */
    .hh {
        position: relative; overflow: hidden;
        display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(230px, 0.85fr) minmax(280px, 1fr);
        align-items: center; gap: 22px;
        padding: 24px 26px; border-radius: 24px;
        background:
            radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--ph) 28%, transparent), transparent 60%),
            linear-gradient(120deg, #0f1428 0%, #0b0f1d 60%, #0a0d18 100%);
        border: 1px solid color-mix(in srgb, var(--ph) 32%, rgba(100, 116, 139, 0.2));
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }
    .hh-glow { position: absolute; right: -10%; top: -60%; width: 50%; height: 220%; background: radial-gradient(circle, color-mix(in srgb, var(--hc) 12%, transparent), transparent 60%); pointer-events: none; }
    .hh-when { position: relative; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .hh-k { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ph); }
    .hh-title { margin: 0; font-size: clamp(26px, 3vw, 36px); font-weight: 900; color: #fff; letter-spacing: -0.5px; line-height: 1.05; }
    .hh-desc { margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8; }
    .year { position: relative; height: 14px; margin-top: 8px; }
    .yr-seg { position: absolute; top: 4px; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--c) 30%, rgba(51, 65, 85, 0.45)); }
    .yr-on { background: var(--c); box-shadow: 0 0 8px color-mix(in srgb, var(--c) 55%, transparent); }
    .yr-now { position: absolute; top: 0; width: 3px; height: 14px; border-radius: 2px; background: #f8fafc; transform: translateX(-1px); box-shadow: 0 0 6px rgba(255, 255, 255, 0.6); }

    .hh-stats { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .hs {
        display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 9px; align-items: center;
        padding: 9px 12px; border-radius: 14px;
        background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .hs-ico { grid-row: 1 / span 2; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .hs-val { font-size: 17px; font-weight: 900; color: #f1f5f9; line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hs-lbl { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }

    .hh-act { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .cta {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px; text-align: left; cursor: pointer;
        width: 100%; padding: 18px 20px; border-radius: 20px; color: #fff; font-family: inherit;
        background: linear-gradient(135deg, #4f46e5, #6d28d9);
        border: 1px solid rgba(196, 181, 253, 0.4);
        box-shadow: 0 12px 30px rgba(79, 70, 229, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .cta:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 38px rgba(79, 70, 229, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
    .cta:disabled { cursor: not-allowed; opacity: 0.6; }
    .cta-gold { background: linear-gradient(135deg, #d97706, #f59e0b); border-color: rgba(253, 230, 138, 0.5); box-shadow: 0 12px 30px rgba(217, 119, 6, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
    .cta-gold:hover:not(:disabled) { box-shadow: 0 16px 38px rgba(217, 119, 6, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
    .cta-ko { background: linear-gradient(135deg, #b45309, #a16207 45%, #7c2d12); border-color: rgba(253, 224, 71, 0.55); }
    .cta-ico { flex-shrink: 0; width: 46px; height: 46px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.16); }
    .cta-t { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .cta-k { font-size: 9.5px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; color: rgba(255, 255, 255, 0.78); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cta-h { font-size: 17px; font-weight: 900; line-height: 1.2; }
    .cta-s { font-size: 11.5px; color: rgba(255, 255, 255, 0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cta-arrow { flex-shrink: 0; display: flex; opacity: 0.9; }
    .cta-alt {
        align-self: center; padding: 4px 10px; border-radius: 8px; cursor: pointer;
        font-family: inherit; font-size: 11.5px; font-weight: 700; color: #94a3b8;
        background: none; border: none; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(148, 163, 184, 0.4);
    }
    .cta-alt:hover:not(:disabled) { color: #fde68a; }
    .cta-alt:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ===================== PANELS ===================== */
    .panel {
        padding: 18px; border-radius: 20px; text-align: left; min-width: 0;
        background: linear-gradient(160deg, color-mix(in srgb, var(--hc) 6%, transparent), rgba(11, 15, 28, 0.78) 45%);
        border: 1px solid rgba(100, 116, 139, 0.22);
    }
    .ph { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .ph-title { margin: 0; display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; color: #e2e8f0; }
    .ph-title :global(svg) { color: var(--hc); }
    .ph-note { font-size: 11px; font-weight: 700; color: #94a3b8; }
    .ph-link { display: inline-flex; align-items: center; gap: 3px; padding: 0; background: none; border: none; cursor: pointer; font-family: inherit; font-size: 11.5px; font-weight: 800; color: #93c5fd; }
    .ph-link:hover { color: #dbeafe; }
    .empty { margin: 0; font-size: 12.5px; line-height: 1.55; color: #94a3b8; padding: 12px 14px; border-radius: 12px; border: 1px dashed rgba(100, 116, 139, 0.35); background: rgba(15, 23, 42, 0.35); }
    .empty.small { font-size: 12px; padding: 10px 12px; }

    /* ===================== TO DO ===================== */
    .todo { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
    .td {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer;
        padding: 11px 12px; border-radius: 14px; color: #94a3b8; font-family: inherit;
        background: color-mix(in srgb, var(--c) 8%, rgba(15, 23, 42, 0.6));
        border: 1px solid color-mix(in srgb, var(--c) 26%, transparent);
        transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .td:hover:not(.td-static) { border-color: color-mix(in srgb, var(--c) 60%, transparent); color: var(--c); transform: translateY(-1px); }
    .td-static { cursor: default; }
    .td-ico { width: 38px; height: 38px; flex-shrink: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); }
    .td-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .td-label { font-size: 13px; font-weight: 800; color: #f1f5f9; }
    .td-sub { font-size: 11.5px; line-height: 1.4; color: #94a3b8; }

    /* ===================== LAYOUT ===================== */
    .hub { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

    /* ===================== TOURNAMENT BANNER ===================== */
    .tbanner {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px; border-radius: 16px;
        background: linear-gradient(135deg, color-mix(in srgb, var(--a) 22%, rgba(15, 23, 42, 0.85)), rgba(15, 23, 42, 0.85));
        border: 1px solid color-mix(in srgb, var(--a) 45%, transparent);
    }
    .tb-mark { position: relative; flex: 0 0 42px; height: 42px; display: grid; place-items: center; }
    .tb-cup { position: relative; z-index: 1; display: flex; color: #fde68a; }
    .tb-pulse { position: absolute; inset: 0; border-radius: 50%; background: color-mix(in srgb, var(--a) 30%, transparent); animation: hubTbPulse 2.4s ease-in-out infinite; }
    @keyframes hubTbPulse { 0%, 100% { transform: scale(0.82); opacity: 0.55; } 50% { transform: scale(1.06); opacity: 0.18; } }
    .tb-done .tb-pulse { animation: none; opacity: 0.5; }
    @media (prefers-reduced-motion: reduce) { .tb-pulse { animation: none; opacity: 0.45; } }
    .tb-body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .tb-top { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .tb-title { font-size: 15px; font-weight: 900; color: #f1f5f9; }
    .tb-round { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #f1f5f9; background: color-mix(in srgb, var(--a) 28%, transparent); border: 1px solid color-mix(in srgb, var(--a) 45%, transparent); }
    .tb-win { background: color-mix(in srgb, var(--a) 46%, transparent); }
    .tb-of, .tb-bo { font-size: 11px; font-weight: 700; color: #94a3b8; }
    .tb-sub { font-size: 12px; font-weight: 600; color: #cbd5e1; display: flex; gap: 6px; flex-wrap: wrap; }
    .tb-vs, .tb-when { color: #94a3b8; }
    .tb-opp { color: var(--o); font-weight: 800; }

    /* ===================== NEXT MATCH ===================== */
    .next { border-color: rgba(139, 92, 246, 0.28); }
    .next-ko { border-color: rgba(234, 179, 8, 0.45); }
    .phase-pill { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 8px; color: var(--ph); background: color-mix(in srgb, var(--ph) 13%, transparent); border: 1px solid color-mix(in srgb, var(--ph) 30%, transparent); white-space: nowrap; }
    .fx { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(190px, 0.75fr); gap: 20px; align-items: center; }
    .fx-left { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .fx-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .fx-ko { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #fde68a; background: rgba(234, 179, 8, 0.16); border: 1px solid rgba(234, 179, 8, 0.45); }
    .fx-tag { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: var(--a); background: color-mix(in srgb, var(--a) 13%, transparent); border: 1px solid color-mix(in srgb, var(--a) 32%, transparent); }
    .fx-bo, .fx-side { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #cbd5e1; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(100, 116, 139, 0.3); }
    .fx-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .fx-dot { flex-shrink: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--a); box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 25%, transparent); }
    .fx-opp { font-size: clamp(22px, 2.4vw, 28px); font-weight: 900; line-height: 1.1; color: #fff; letter-spacing: -0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fx-desc { margin: 0; font-size: 12.5px; line-height: 1.55; color: #94a3b8; }
    .scoutbtn { align-self: flex-start; }
    .fx-vs { display: flex; align-items: center; gap: 12px; }
    .fx-pw { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .fx-pw-n { font-size: 30px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
    .fx-pw-l { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #94a3b8; }
    .fx-x { font-size: 13px; font-weight: 900; color: #64748b; }
    .fx-right { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .odds { display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 8px; row-gap: 5px; }
    .odds-n { font-size: 24px; font-weight: 900; color: #e2e8f0; font-variant-numeric: tabular-nums; }
    .odds-good { color: #4ade80; }
    .odds-bad { color: #f87171; }
    .odds-l { font-size: 11px; font-weight: 700; color: #94a3b8; }
    .odds-bar { grid-column: 1 / -1; height: 6px; border-radius: 6px; background: rgba(30, 41, 59, 0.9); overflow: hidden; }
    .odds-bar div { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #6366f1, #a78bfa); }
    .btn-play {
        display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        padding: 11px 16px; border-radius: 12px; cursor: pointer;
        font-family: inherit; font-size: 13px; font-weight: 900; color: #fff;
        background: linear-gradient(135deg, #4f46e5, #7c3aed); border: 1px solid rgba(196, 181, 253, 0.4);
        box-shadow: 0 8px 20px rgba(79, 70, 229, 0.3);
    }
    .btn-play:hover:not(:disabled) { filter: brightness(1.08); }
    .btn-play:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-ghost { color: #cbd5e1; background: rgba(30, 41, 59, 0.6); border-color: rgba(100, 116, 139, 0.4); box-shadow: none; font-weight: 800; padding: 9px 14px; }
    .fx-note { margin: 12px 0 0; font-size: 11.5px; color: #94a3b8; }
    .benched { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); }
    .benched-t { font-size: 12.5px; font-weight: 800; color: #fca5a5; }
    .benched-d { font-size: 11.5px; line-height: 1.5; color: #cbd5e1; }
    .nofx { display: flex; align-items: flex-start; gap: 14px; padding: 4px 2px; }
    .nofx-ico { flex-shrink: 0; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .nofx-t { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .nofx-h { font-size: 16px; font-weight: 900; color: #f1f5f9; }
    .nofx-weeks { margin-left: 6px; font-size: 11px; font-weight: 700; color: #94a3b8; }
    .nofx-s { font-size: 12.5px; line-height: 1.55; color: #cbd5e1; }
    .nofx-done { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #4ade80; }

    /* ===================== ACTIVITIES ===================== */
    .slots { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border-radius: 10px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(100, 116, 139, 0.3); white-space: nowrap; }
    .slots-pips { display: inline-flex; gap: 3px; }
    .spip { width: 8px; height: 8px; border-radius: 50%; background: rgba(148, 163, 184, 0.22); }
    .spip-on { background: #a78bfa; box-shadow: 0 0 6px rgba(167, 139, 250, 0.6); }
    .slots-n { font-size: 14px; font-weight: 900; color: #c4b5fd; }
    .slots-l { font-size: 11px; font-weight: 700; color: #94a3b8; }
    .board-how { margin: -6px 0 12px; font-size: 12px; line-height: 1.5; color: #94a3b8; }

    .act-group + .act-group { margin-top: 16px; }
    .ag-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(100, 116, 139, 0.18); }
    .ag-name { font-size: 11px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #cbd5e1; }
    .ag-blurb { font-size: 11.5px; color: #94a3b8; }
    .acts { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
    .act {
        display: flex; flex-direction: column; gap: 6px; text-align: left; cursor: pointer;
        padding: 12px; border-radius: 14px; font-family: inherit;
        background: color-mix(in srgb, var(--a) 6%, rgba(15, 23, 42, 0.65));
        border: 1px solid color-mix(in srgb, var(--a) 22%, rgba(100, 116, 139, 0.15));
        transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }
    .act:hover:not(:disabled) { border-color: color-mix(in srgb, var(--a) 60%, transparent); background: color-mix(in srgb, var(--a) 11%, rgba(15, 23, 42, 0.65)); transform: translateY(-1px); }
    .act:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
    .act-off, .act:disabled { opacity: 0.5; cursor: not-allowed; }
    .act-flash { border-color: color-mix(in srgb, var(--a) 65%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 16%, transparent); }
    .act-sugg { border-color: color-mix(in srgb, var(--a) 50%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--a) 25%, transparent), 0 8px 22px color-mix(in srgb, var(--a) 14%, transparent); }
    .act-top { display: flex; align-items: center; gap: 10px; }
    .act-ico { flex-shrink: 0; width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 15px; line-height: 1; color: var(--a); background: color-mix(in srgb, var(--a) 15%, transparent); }
    .act-head { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .act-name { font-size: 13.5px; font-weight: 800; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .act-sugg-tag { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; font-size: 10px; font-weight: 800; color: var(--a); }
    .act-cost { flex-shrink: 0; font-size: 11px; font-weight: 900; padding: 3px 7px; border-radius: 7px; color: #fca5a5; background: rgba(239, 68, 68, 0.1); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .act-cost.gain { color: #86efac; background: rgba(34, 197, 94, 0.1); }
    .act-desc { font-size: 12px; line-height: 1.45; color: #a5b4c8; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .act-gives { display: flex; flex-wrap: wrap; gap: 4px; }
    .give { font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px; color: #86efac; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.25); }
    .give-down { color: #fca5a5; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.25); }
    .give-xp { color: #ddd6fe; background: rgba(139, 92, 246, 0.16); border-color: rgba(167, 139, 250, 0.4); }
    .act-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .act-tags:empty { display: none; }
    .act-tag { font-size: 10px; font-weight: 800; letter-spacing: 0.3px; color: #cbd5e1; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(100, 116, 139, 0.35); padding: 2px 7px; border-radius: 6px; }
    .act-tag-gold { color: #fde047; border-color: rgba(234, 179, 8, 0.35); }
    .act-tag-warn { color: #fbbf24; border-color: rgba(245, 158, 11, 0.35); }
    .act-block { font-size: 11px; font-weight: 800; color: #fbbf24; }
    .act-go { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; color: var(--a); }
    .flash { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 13px; border-radius: 12px; font-size: 12.5px; line-height: 1.5; color: #e2e8f0; background: rgba(34, 197, 94, 0.09); border: 1px solid rgba(34, 197, 94, 0.3); }
    .flash :global(svg) { color: #4ade80; flex-shrink: 0; }

    /* ===================== WEEK LOG ===================== */
    .tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .tl-item { position: relative; display: flex; gap: 12px; padding: 0 0 13px 0; }
    .tl-item::before { content: ''; position: absolute; left: 4px; top: 13px; bottom: 0; width: 1px; background: rgba(100, 116, 139, 0.35); }
    .tl-item:last-child { padding-bottom: 0; }
    .tl-item:last-child::before { display: none; }
    .tl-dot { flex-shrink: 0; width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; background: var(--a); box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 18%, transparent); }
    .tl-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .tl-label { font-size: 12.5px; font-weight: 800; color: #f1f5f9; }
    .tl-detail { font-size: 12px; line-height: 1.5; color: #a5b4c8; }

    /* ===================== ADVANCE (sticky) ===================== */
    .adv {
        position: sticky; bottom: 12px; z-index: 6;
        display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
        padding: 12px 14px 12px 18px; border-radius: 18px;
        background: rgba(10, 14, 26, 0.94);
        border: 1px solid rgba(245, 158, 11, 0.35);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 -10px 30px rgba(2, 6, 23, 0.55);
    }
    .adv-txt { flex: 1 1 240px; min-width: 0; }
    .adv-h { margin: 0 0 2px; font-size: 12px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #fde68a; }
    .adv-line { margin: 0; font-size: 12.5px; line-height: 1.5; color: #cbd5e1; }
    .adv-block { color: #fca5a5; font-weight: 700; }
    .adv-warn { color: #fbbf24; }
    .advbtn {
        flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px;
        padding: 12px 22px; border-radius: 14px; cursor: pointer;
        font-family: inherit; font-size: 13.5px; font-weight: 900; color: #1c1404;
        background: linear-gradient(135deg, #fde68a, #f59e0b); border: none;
        box-shadow: 0 8px 22px rgba(245, 158, 11, 0.3);
    }
    .advbtn:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
    .advbtn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

    /* ===================== SIDE: BRIEF ===================== */
    .brief { border-color: rgba(56, 189, 248, 0.28); }
    .verdict { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding: 8px 12px; border-radius: 12px; background: color-mix(in srgb, var(--v) 10%, rgba(15, 23, 42, 0.6)); border: 1px solid color-mix(in srgb, var(--v) 40%, transparent); }
    .verdict-k { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .verdict-v { font-size: 13px; font-weight: 900; color: var(--v); }
    .obj-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .obj { --t: #64748b; display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(100, 116, 139, 0.22); border-left: 3px solid var(--t); }
    .obj-good { --t: #22c55e; }
    .obj-bad { --t: #ef4444; background: rgba(239, 68, 68, 0.06); }
    .obj-idle { --t: #64748b; }
    .obj-stretch { border-style: dashed; border-left-style: solid; }
    .obj-ico { flex-shrink: 0; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: var(--t); background: color-mix(in srgb, var(--t) 14%, transparent); }
    .obj-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .obj-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .obj-group { font-size: 10px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #94a3b8; }
    .obj-state { font-size: 10px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; padding: 2px 7px; border-radius: 6px; color: var(--t); background: color-mix(in srgb, var(--t) 13%, transparent); border: 1px solid color-mix(in srgb, var(--t) 35%, transparent); white-space: nowrap; }
    .obj-title { font-size: 13px; font-weight: 800; color: #f1f5f9; }
    .obj-bar { height: 5px; border-radius: 5px; background: rgba(148, 163, 184, 0.14); overflow: hidden; }
    .obj-fill { display: block; height: 100%; border-radius: 5px; background: var(--t); transition: width 0.3s ease; }
    .obj-detail { font-size: 11.5px; line-height: 1.45; color: #a5b4c8; }
    .obj-bonus { margin-left: 6px; color: #fbbf24; font-weight: 800; white-space: nowrap; }
    .brief-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; font-size: 11.5px; line-height: 1.5; color: #94a3b8; }
    .strikes { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; color: #94a3b8; white-space: nowrap; }
    .strikes-on { color: #f87171; }
    .strike { width: 10px; height: 10px; border-radius: 3px; background: rgba(148, 163, 184, 0.16); border: 1px solid rgba(148, 163, 184, 0.3); }
    .strike-on { background: #ef4444; border-color: #ef4444; }
    .strike:last-of-type { margin-right: 4px; }
    .brief-alarm { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; padding: 9px 12px; border-radius: 10px; font-size: 12px; font-weight: 700; color: var(--v); background: color-mix(in srgb, var(--v) 10%, transparent); border: 1px solid color-mix(in srgb, var(--v) 32%, transparent); }

    /* ===================== SIDE: CONTRACT / SCOUTING ===================== */
    .stat-chip { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: var(--a); background: color-mix(in srgb, var(--a) 13%, transparent); border: 1px solid color-mix(in srgb, var(--a) 32%, transparent); white-space: nowrap; }
    .ct-line { margin: 0; font-size: 12.5px; line-height: 1.55; color: #cbd5e1; }
    .ct-tier { display: inline-block; margin-top: 8px; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: var(--a); border: 1px solid color-mix(in srgb, var(--a) 35%, transparent); }
    .meter-row { margin-top: 14px; }
    .meter-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
    .meter-lbl { font-size: 10.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .meter-val { font-size: 12px; font-weight: 900; color: #e2e8f0; font-variant-numeric: tabular-nums; }
    .meter-bar { height: 6px; border-radius: 6px; background: rgba(30, 41, 59, 0.9); overflow: hidden; }
    .meter-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #7c3aed, #a78bfa); transition: width 0.3s ease; }
    .meter-fill.scout { background: linear-gradient(90deg, #0891b2, #22d3ee); }
    .meter-note { display: block; margin-top: 6px; font-size: 11.5px; line-height: 1.5; color: #94a3b8; }
    .side-btns { display: flex; gap: 8px; margin-top: 14px; }
    .btn-soft { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border-radius: 12px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 900; color: #e0e7ff; background: rgba(99, 102, 241, 0.16); border: 1px solid rgba(129, 140, 248, 0.35); }
    .btn-soft:hover { background: rgba(99, 102, 241, 0.28); }
    .btn-soft-live { color: #f5f3ff; background: rgba(168, 85, 247, 0.24); border-color: rgba(192, 132, 252, 0.6); }
    .off-n { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; font-size: 10.5px; color: #1e1b4b; background: #c4b5fd; }
    .scout-list { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
    .scout-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
    .scout-n { font-size: 18px; font-weight: 900; color: #22d3ee; }
    .scout-l { font-size: 10.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #94a3b8; }
    .scout-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; border-radius: 9px; background: rgba(15, 23, 42, 0.5); border-left: 3px solid var(--a); }
    .scout-team { font-size: 12px; font-weight: 700; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scout-int { font-size: 12px; font-weight: 900; color: var(--a); }

    /* ===================== SIDE: SEASON ===================== */
    .sn-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .sn-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 9px 10px; border-radius: 12px; background: rgba(2, 6, 23, 0.4); border: 1px solid rgba(148, 163, 184, 0.12); }
    .sn-v { font-size: 17px; font-weight: 900; color: #f1f5f9; font-variant-numeric: tabular-nums; }
    .sn-v.gold { color: #fbbf24; }
    .sn-k { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .mt { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .mt-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 9px; background: rgba(15, 23, 42, 0.5); border-left: 3px solid color-mix(in srgb, var(--a) 60%, transparent); }
    .mt-me { background: color-mix(in srgb, var(--a) 14%, rgba(15, 23, 42, 0.6)); border-left-color: var(--a); }
    .mt-rank { font-size: 12px; font-weight: 900; color: #94a3b8; }
    .mt-me .mt-rank { color: var(--a); }
    .mt-team { font-size: 12.5px; font-weight: 700; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mt-me .mt-team { color: #fff; font-weight: 900; }
    .mt-rec { font-size: 12px; font-weight: 800; color: #cbd5e1; font-variant-numeric: tabular-nums; }
    .sn-note { display: block; margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #94a3b8; }

    /* ===================== SIDE: LAST MATCH ===================== */
    .lm { padding: 12px; border-radius: 14px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(100, 116, 139, 0.22); }
    .lm-win { border-left: 4px solid #22c55e; }
    .lm-loss { border-left: 4px solid #ef4444; }
    .lm-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
    .lm-res { font-size: 11px; font-weight: 900; letter-spacing: 1.3px; }
    .lm-win .lm-res { color: #4ade80; }
    .lm-loss .lm-res { color: #f87171; }
    .lm-score { font-size: 20px; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
    .lm-opp { flex: 1; min-width: 0; font-size: 12px; font-weight: 700; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lm-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
    .lm-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .lm-v { font-size: 13.5px; font-weight: 900; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
    .lm-k { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .lm-mvp { margin-top: 10px; display: inline-block; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #fde047; background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.35); }
    .lm-bench { margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: #cbd5e1; }
    .lm-head { margin: 10px 0 0; font-size: 12px; line-height: 1.55; font-style: italic; color: #94a3b8; }

    /* The recap scoreboard, at side-rail density: the two sides STACK, and every
       seat is ONE line (champion beside the name), so ten rows fit a narrow rail. */
    .lmb { margin-top: 12px; }
    .lmb-tabs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
    .lmb-tab { display: flex; align-items: baseline; gap: 5px; padding: 4px 9px; border-radius: 7px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(100, 116, 139, 0.35); font-family: inherit; cursor: pointer; }
    .lmb-tab:hover { border-color: rgba(139, 92, 246, 0.5); }
    .lmb-tab:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
    .lmb-on { background: rgba(139, 92, 246, 0.14); border-color: rgba(139, 92, 246, 0.55); }
    .lmb-tab-n { font-size: 11px; font-weight: 800; color: #cbd5e1; }
    .lmb-on .lmb-tab-n { color: #fff; }
    .lmb-tab-r { font-size: 10px; font-weight: 900; color: #f87171; }
    .lmb-won .lmb-tab-r { color: #4ade80; }
    .lmb-cap { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; margin-bottom: 7px; }
    .lmb-dot { margin: 0 4px; color: #64748b; }
    .lmb-side { padding: 8px 10px 6px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(100, 116, 139, 0.22); border-top: 2px solid rgba(239, 68, 68, 0.45); }
    .lmb-side + .lmb-side { margin-top: 8px; }
    .lmb-side-win { border-top-color: rgba(34, 197, 94, 0.6); }
    .lmb-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
    .lmb-team { flex: 1; min-width: 0; font-size: 12px; font-weight: 800; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lmb-verdict { flex-shrink: 0; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #f87171; }
    .lmb-side-win .lmb-verdict { color: #4ade80; }
    .lmb-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: baseline; gap: 7px; padding: 3px 0; border-bottom: 1px solid rgba(100, 116, 139, 0.15); }
    .lmb-row:last-child { border-bottom: none; }
    .lmb-role { font-size: 9.5px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #94a3b8; }
    .lmb-me .lmb-role { color: #c4b5fd; }
    .lmb-who { display: flex; align-items: baseline; gap: 5px; min-width: 0; }
    .lmb-nm { min-width: 0; font-size: 12px; font-weight: 700; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lmb-me .lmb-nm { color: #fff; }
    .lmb-you { flex-shrink: 0; font-size: 9px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; color: #ddd6fe; background: rgba(139, 92, 246, 0.22); }
    .lmb-champ { min-width: 0; font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lmb-kda { font-size: 11.5px; font-weight: 800; color: #cbd5e1; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .lmb-me .lmb-kda { color: #fff; }

    /* ===================== SIDE: SPLIT META ===================== */
    .meta-mine { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding: 9px 12px; border-radius: 11px; background: rgba(15, 23, 42, 0.55); border-left: 3px solid #64748b; }
    .meta-mine.meta-strong { border-left-color: #4ade80; }
    .meta-mine.meta-weak { border-left-color: #f87171; }
    .meta-mine-k { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .meta-mine-n { flex: 1; min-width: 0; font-size: 13px; font-weight: 800; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta-mine-t { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #cbd5e1; }
    .meta-mine.meta-strong .meta-mine-t { color: #4ade80; }
    .meta-mine.meta-weak .meta-mine-t { color: #f87171; }
    .meta-band { display: flex; align-items: baseline; gap: 9px; margin-top: 10px; }
    .meta-k { flex-shrink: 0; width: 48px; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .meta-k.meta-strong { color: #4ade80; }
    .meta-k.meta-weak { color: #f87171; }
    .meta-list { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
    .meta-ch { font-size: 11px; font-weight: 700; color: #e2e8f0; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(100, 116, 139, 0.35); padding: 2px 7px; border-radius: 6px; }
    .meta-ch.meta-nil { color: #94a3b8; font-weight: 600; font-style: italic; }
    .meta-note { display: block; margin-top: 10px; font-size: 11.5px; line-height: 1.5; color: #94a3b8; }

    /* ===================== SIDE: NEWS ===================== */
    .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .feed-item { padding: 9px 12px; border-radius: 11px; background: rgba(15, 23, 42, 0.5); border-left: 3px solid var(--a); min-width: 0; }
    .feed-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
    .feed-type { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: var(--a); }
    .feed-when { font-size: 10.5px; font-weight: 700; color: #94a3b8; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .feed-txt { margin: 0; font-size: 12.5px; line-height: 1.5; color: #cbd5e1; }

    /* ===================== RESPONSIVE ===================== */
    @media (max-width: 1240px) {
        .hh { grid-template-columns: minmax(0, 1fr) minmax(260px, 0.9fr); }
        .hh-stats { grid-column: 1 / -1; grid-row: 2; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .fx { grid-template-columns: minmax(0, 1fr) auto; }
        .fx-right { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; }
    }
    @media (max-width: 1060px) {
        .hub { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
        .hh { grid-template-columns: minmax(0, 1fr); padding: 18px; gap: 16px; }
        .hh-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-row: auto; }
        .fx { grid-template-columns: minmax(0, 1fr); }
        .fx-vs { justify-content: flex-start; }
        .fx-right { display: flex; }
    }
    @media (max-width: 620px) {
        .panel { padding: 14px; border-radius: 16px; }
        .acts { grid-template-columns: minmax(0, 1fr); }
        .todo { grid-template-columns: minmax(0, 1fr); }
        /* One compact row on a phone. Stacked, .adv-txt's 240px flex-basis became
           a 240px HEIGHT and the sticky bar covered a third of the screen. */
        .adv { flex-wrap: nowrap; gap: 10px; padding: 10px 10px 10px 14px; bottom: 8px; }
        .adv-txt { flex: 1 1 auto; }
        .adv-line:not(.adv-block) { display: none; }
        .advbtn { padding: 11px 14px; font-size: 13px; }
        .lm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .cta { padding: 14px 16px; }
        .cta-ico { width: 40px; height: 40px; }
    }
</style>
