<script>
    // ===================================================================
    //  CAREER -- DOSSIER
    // ===================================================================
    //  One career, read end to end: the player, their numbers, the room they
    //  play in, and their legacy. Everything here is a READ of the career
    //  object handed in through `c` plus the pure readers in ratings.js and
    //  awards.js.
    //
    //  IT RENDERS TWO KINDS OF CAREER:
    //    mine = true    the save this device owns (Profile.svelte)
    //    mine = false   a stranger's, downloaded off the global board
    //
    //  THE `c0` GUARD IS LOAD-BEARING. Every reader in awards.js opens
    //  `const st = c || snapshot()`, so legacyScore(null), peakOVR(undefined),
    //  careerYears(null) and friends silently return THE VIEWER'S OWN NUMBERS
    //  under a stranger's handle -- a bug that looks like data rather than like
    //  an error. Nothing below may pass a bare `c` to any of them.
    //
    //  IT NEVER WRITES A SAVE. The only writes in this file are pushOverlay()
    //  and saveCareer() in the retirement block, and BOTH are behind {#if mine}:
    //  browsing a stranger must never touch the local career. Everything else --
    //  the signature switch, the growth strip, every second-person string -- is
    //  gated the same way.

    import Card from '../card/Card.svelte';

    import { blankCareer, pushOverlay, saveCareer } from '../../stores/career.js';
    import {
        ATTRS, ATTR_BY_KEY, ROLE_BY_ID, REGION_BY_ID, PLAYSTYLE_BY_ID,
        CHAMPION_BY_ID, PATH_BY_ID, teamById, RETIREMENT_AGE_MIN,
        TRAIT_RARITIES, championFit, proficiency01, proficiencyBand,
    } from '../../career/constants.js';
    import {
        calcOVR, ovrTier, ovrLabel, ageBand, growthFor, statusInfo, toCareerCard,
        rankFromMMR, marketValueFor, fmtGold, fmtKDA, fmtRecord, ordinal,
        traitsOf, revealAgeFor,
    } from '../../career/ratings.js';
    import {
        canSwitchChampion, switchableChampions, championSwitchPreview, switchChampion,
    } from '../../career/contracts.js';
    import {
        MILESTONES, claimedMilestoneIds, awardHistoryByYear, AWARD_BY_ID,
        legacyScore, earnedLegacyScore, legacyTier, LEGACY_TIER_BANDS, peakOVR, careerYears,
        canRetire, trophyCabinet,
    } from '../../career/awards.js';
    import { clubRosterFor, ROSTER_SLOTS, clubMomentum, clubBlock } from '../../career/teams.js';
    import { boardDBReady } from '../../career/board.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    // Award / trophy tiers share one palette across the whole screen.
    const TONE = { legendary: '#eab308', major: '#a78bfa', minor: '#64748b' };
    const TIER_NAME = { legendary: 'Legendary', major: 'Major', minor: 'Minor' };
    const SPLIT_NAME = { spring: 'Spring', summer: 'Summer' };
    // Em dash, built from its code point so this file stays pure ASCII.
    const DASH = String.fromCharCode(8212);

    function toneOf(t) { return TONE[t] || TONE.minor; }

    /** Number(), never `|| 0`. A save field that arrives as the STRING "60" is
     *  truthy, so `Math.round(x || 0)` returns NaN and a bar renders
     *  `width:NaN%` -- an empty track under a label reading "NaN / NaN".
     *  Infinity survives both idioms and prints as the word. Non-finite means
     *  "not measured", i.e. zero.
     *
     *  Declared up here rather than beside its first use: Svelte runs `$:`
     *  blocks in SOURCE ORDER, and the earliest caller is above the attribute
     *  table. */
    const fin = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    // ---- props ---------------------------------------------------------
    /** The career to render. Profile passes $career; the board passes a
     *  reified stranger. NEVER read the store here -- a dossier that fell back
     *  to the live save would print the viewer's own career under someone
     *  else's name. */
    export let c = null;
    /** Owner view. Gates every mutation and every second-person string. */
    export let mine = false;
    /** The authoritative figures off the published board row, when this career
     *  came from there. remoteFiguresFrom(row) or null. */
    export let remote = null;

    const BLANK = blankCareer();
    $: c0 = (c && typeof c === 'object') ? c : BLANK;

    // ---- identity -----------------------------------------------------
    $: p = c0.player || BLANK.player;
    $: time = c0.time || BLANK.time;
    /** Printed in three places and fed to toCareerCard(); a career-shaped object
     *  with an empty `time` would otherwise render the word "undefined". */
    $: year = Number.isFinite(Number(time.year)) && Number(time.year)
        ? Math.round(Number(time.year)) : BLANK.time.year;
    /** Same reason as `year`: it is interpolated bare in four places, and
     *  ageBand()/growthFor() already default internally so only the display
     *  copy was exposed. */
    $: age = Number.isFinite(Number(p.age)) ? Math.round(Number(p.age)) : BLANK.player.age;
    $: startAge = Number.isFinite(Number(p.startAge))
        ? Math.round(Number(p.startAge)) : BLANK.player.startAge;
    $: soloq = c0.soloq || BLANK.soloq;
    $: retired = !!(c0.flags && c0.flags.retired);
    $: region = REGION_BY_ID[p.region] || REGION_BY_ID.LEC;
    $: role = ROLE_BY_ID[p.role] || ROLE_BY_ID.MID;
    $: style = PLAYSTYLE_BY_ID[p.playstyle] || null;
    $: champ = CHAMPION_BY_ID[p.champion] || null;
    $: path = PATH_BY_ID[p.path] || PATH_BY_ID.precomp;
    // The five derived stores this screen used to read are all pure functions of
    // the career object, so they are re-derived over c0 rather than imported --
    // a store read is a read of the LOCAL save, which is exactly wrong here.
    $: team = p.clubId ? teamById(p.clubId) : null;
    $: teamName = team ? team.name : 'Free Agent';
    $: teamAccent = team ? team.accent : '#64748b';
    // calcOVR, NOT boardOVR, and the distinction is deliberate.
    //
    // boardOVR() floors at 1 and falls back to MID for a role that does not
    // resolve. That is exactly right when PUBLISHING, where an ovr of 0 would be
    // denied by the rules and the failure swallowed. It is exactly wrong for
    // DISPLAY: on a save whose role has rotted, it turns an honest "Unknown" into
    // a confident "Academy Prospect" and invents a rating to go with it. The
    // careerRender rot states 8b-rotten-collections and 9-role-is-unknown both
    // caught that as a real change against the pre-extraction baseline.
    //
    // Safe for a stranger's dossier too: reifyCareer() normalises role through
    // ROLE_IDS before anything renders, so a downloaded career never reaches
    // here with an unresolvable role in the first place.
    $: ovr = calcOVR(p.attrs, p.role);
    $: potOVR = calcOVR(p.potential, p.role);
    $: rank = rankFromMMR(fin(soloq.mmr));
    $: mval = marketValueFor({
        ovr, potentialOVR: potOVR, age: p.age, region: p.region,
        hype: p.hype, valueMult: p.valueMult,
    });
    $: statusI = statusInfo(p.status);
    // Card.svelte interpolates card.role and card.region with no guard, so a
    // player object MISSING either prints the literal "undefined" on the hero
    // card. A role that is present but unknown is left alone on purpose: it is
    // what the save says, and Club.svelte draws the same card the same way.
    $: careerCard = toCareerCard({
        ...p,
        role: (typeof p.role === 'string' && p.role) ? p.role : role.id,
        region: (typeof p.region === 'string' && p.region) ? p.region : region.id,
    }, teamName, year);
    $: tier = ovrTier(ovr);
    $: band = ageBand(p.age);
    $: growth = growthFor(p.age);
    $: years = careerYears(c0);
    $: headroom = Math.max(0, potOVR - ovr);
    $: peakRank = rankFromMMR(fin(soloq.peakMMR));
    // Third-person copy needs the handle twice over: once to open a sentence and
    // once inside one. A career with no handle still has to read as English.
    $: who = p.handle || 'This player';
    $: whom = p.handle || 'this player';
    $: styleFocus = style
        ? Object.keys(style.growth || {})
            .filter(k => (style.growth[k] || 0) > 1)
            .map(k => (ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].abbr : null))
            .filter(Boolean).join(' ')
        : '';

    // ---- attributes ---------------------------------------------------
    //  Read through a fallback rather than off `p` directly: `c` is a PROP now,
    //  so a caller can hand over a career-shaped object that is missing them,
    //  and `p.attrs[key]` would throw where boardOVR() only returns 1.
    $: attrs = p.attrs || BLANK.player.attrs;
    $: potential = p.potential || BLANK.player.potential;
    $: attrRows = ATTRS.map(a => {
        const cur = Math.round(fin(attrs[a.key]));
        const pot = Math.max(cur, Math.round(fin(potential[a.key])));
        return {
            ...a,
            cur, pot,
            room: pot - cur,
            weight: Math.round((role.weights[a.key] || 0) * 100),
        };
    });

    // ---- totals -------------------------------------------------------
    /** Totals are printed BARE in eight tiles and fed to fmtRecord / fmtKDA, so
     *  a single non-finite entry reads as "Infinity Games" and "NaN% Win rate"
     *  rather than as a broken save. Coerced once, here, so no tile has to
     *  guard itself. */
    $: t = (() => {
        const src = c0.totals || BLANK.totals;
        if (!src || typeof src !== 'object') return BLANK.totals;
        const out = {};
        for (const k of Object.keys(src)) {
            const v = src[k];
            out[k] = (typeof v === 'number' || typeof v === 'string') ? fin(v) : v;
        }
        return out;
    })();
    $: decided = (t.wins || 0) + (t.losses || 0);
    $: winRate = decided > 0 ? Math.round((t.wins / decided) * 100) : 0;
    $: kda = fmtKDA(t.kills, t.deaths, t.assists);
    $: avgRating = (t.games || 0) > 0 ? Math.round((t.ratingSum / t.games) * 100) / 100 : 0;
    $: peak = remote ? remote.peakOVR : peakOVR(c0);

    function ratingTone(r) {
        if (r >= 8.5) return '#eab308';
        if (r >= 7.5) return '#22c55e';
        if (r >= 6.5) return '#3b82f6';
        if (r >= 5.5) return '#f59e0b';
        return '#ef4444';
    }

    /** Lifetime earnings only when the save actually carries a ledger --
     *  the balance in the wallet is not the same number and guessing it
     *  would be a lie, so the tile disappears instead. */
    function careerEarnings(st) {
        const ledger = Number(st && st.totals ? st.totals.earnings : NaN);
        if (Number.isFinite(ledger)) return Math.round(ledger);
        const alt = Number(st && st.money ? st.money.totalEarned : NaN);
        if (Number.isFinite(alt)) return Math.round(alt);
        const rows = Array.isArray(st && st.history) ? st.history : [];
        let sum = 0, hit = false;
        for (const h of rows) {
            const v = Number(h && (h.earnings != null ? h.earnings : h.wages));
            if (Number.isFinite(v)) { sum += v; hit = true; }
        }
        return hit ? Math.round(sum) : null;
    }
    $: earnings = careerEarnings(c0);

    // ---- honours ------------------------------------------------------
    $: awardYears = awardHistoryByYear(c0);
    $: awardCount = awardYears.reduce((s, y) => s + y.awards.length, 0);
    $: awardLegacy = awardYears.reduce((s, y) => s + (y.legacyPoints || 0), 0);
    $: trophies = (Array.isArray(c0.trophies) ? c0.trophies : [])
        .filter(Boolean)
        .slice()
        .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    // c0, never c — a bare `c` here would fall through to snapshot() and print
    // the VIEWER'S own cabinet under a stranger's handle.
    $: cabinet = (() => { try { return trophyCabinet(c0) || []; } catch (e) { return []; } })();
    // The published row carries the TRUE count; a downloaded dossier's trophy
    // list is rebuilt from an award list that may have been trimmed to fit.
    $: trophyCount = remote ? remote.trophyCount : trophies.length;
    $: trophiesUnlisted = Math.max(0, trophyCount - trophies.length);

    // ---- milestones ---------------------------------------------------
    let msFilter = 'all';
    $: doneIds = claimedMilestoneIds(c0);
    $: msRows = MILESTONES.map(m => ({ ...m, done: doneIds.has(m.id) }));
    $: msDone = msRows.filter(m => m.done).length;
    $: msShown = msRows.filter(m => msFilter === 'all' || (msFilter === 'done' ? m.done : !m.done));

    function setFilter(f) {
        if (msFilter === f) return;
        msFilter = f;
        playSound('click');
    }

    // ---- legacy -------------------------------------------------------
    //  The ROW is the authority when there is one. earnedLegacyScore() needs the
    //  complete uncapped awards array, and a dossier blob is trimmed to fit
    //  24kb -- recomputing off it reads LOW, which looks like a bug in the score
    //  rather than in the transport.
    $: lEarned = remote ? remote.earnedScore : earnedLegacyScore(c0);
    $: lScore = remote ? remote.earnedScore + remote.boughtScore : legacyScore(c0);
    $: lEndowed = Math.max(0, lScore - lEarned);
    $: lTier = legacyTier(lScore);
    $: bandRows = LEGACY_TIER_BANDS;
    $: bandIdx = bandRows.findIndex(b => b.id === lTier.id);
    $: nextBand = bandIdx > 0 ? bandRows[bandIdx - 1] : null;
    $: toNext = nextBand ? Math.max(0, nextBand.min - lScore) : 0;
    $: bandPct = nextBand
        ? Math.max(0, Math.min(100, ((lScore - lTier.min) / Math.max(1, nextBand.min - lTier.min)) * 100))
        : 100;

    // ---- season history ------------------------------------------------
    function rowAwards(st, h) {
        const shape = a => {
            if (!a) return null;
            if (typeof a === 'string') {
                const d = AWARD_BY_ID[a];
                return { id: a, name: d ? d.name : a, icon: d ? d.icon : '\u{1F3C5}', tier: d ? d.tier : 'minor' };
            }
            const d = AWARD_BY_ID[a.id] || {};
            const name = a.name || d.name;
            if (!name) return null;
            return { id: a.id || name, name, icon: a.icon || d.icon || '\u{1F3C5}', tier: a.tier || d.tier || 'minor' };
        };
        const raw = (Array.isArray(h && h.awards) ? h.awards : []).map(shape).filter(Boolean);
        if (raw.length) return raw;
        const yr = Number(h && h.year);
        return (Array.isArray(st.awards) ? st.awards : [])
            .filter(a => a && Number(a.year) === yr && (!h.split || a.split === h.split))
            .map(shape).filter(Boolean);
    }

    $: historyRows = (Array.isArray(c0.history) ? c0.history : [])
        .filter(Boolean)
        .map((h, i) => ({
            key: `${h.year}-${h.split}-${h.teamId || 'none'}-${i}`,
            year: Number(h.year) || 0,
            split: h.split || '',
            splitName: SPLIT_NAME[h.split] || (h.split ? String(h.split) : 'Season'),
            teamName: (teamById(h.teamId) || {}).name || (h.teamId ? String(h.teamId) : 'Free Agent'),
            teamAccent: (teamById(h.teamId) || {}).accent || '#64748b',
            w: Number(h.w) || 0,
            l: Number(h.l) || 0,
            placement: Number(h.placement) || 0,
            awards: rowAwards(c0, h),
        }))
        .sort((a, b) => (b.year - a.year) || ((b.split === 'summer' ? 1 : 0) - (a.split === 'summer' ? 1 : 0)));

    // ---- genetic traits -------------------------------------------------
    //  Rolled and revealed on one birthday, once, years into the career. Before
    //  that there is genuinely nothing to show -- the roll has not happened, so
    //  there is nothing here to reload the save and re-roll for either.
    $: traits = traitsOf(p);
    $: traitRevealAge = revealAgeFor(p);
    $: traitPending = !traits.length && !retired;

    // ---- signature champion --------------------------------------------
    //  Re-maining MUTATES THE STORE, so the whole flow is owner-only. A viewer
    //  reading a stranger sees the pick and nothing they can press.
    let switching = false;
    let switchPick = '';

    $: switchGate = mine ? canSwitchChampion(c0) : { ok: false, reason: '' };
    $: switchPool = (mine && switching) ? switchableChampions(c0) : [];
    $: switchPreview = (mine && switching && switchPick) ? championSwitchPreview(c0, switchPick) : null;
    // A career created before signature picks were gated by playstyle can be
    // holding an off-style champion. It is never taken away from them -- it is
    // labelled, and the switch flow is offered.
    $: champOffStyle = !!(champ && style && championFit(champ, style.id) < 0.5);

    function openSwitch() {
        if (!mine) return;
        playSound('click');
        if (!switchGate.ok) { showToast(switchGate.reason, 'error'); return; }
        switching = true;
        switchPick = '';
    }

    function cancelSwitch() {
        playSound('click');
        switching = false;
        switchPick = '';
    }

    function pickSwitch(id) {
        playSound('click');
        switchPick = switchPick === id ? '' : id;
    }

    function commitSwitch() {
        // The one call in this file that changes a career. `mine` is the gate.
        if (!mine || !switchPick) return;
        const res = switchChampion(switchPick);
        showToast(res.msg, res.ok ? 'success' : 'error');
        if (res.ok) { switching = false; switchPick = ''; }
    }

    // ---- champion proficiency -------------------------------------------
    //  Every game played on a champion is banked against it. Most-played first;
    //  the signature pick is flagged rather than pinned to the top, because
    //  after a few seasons it is often no longer the one with the hours on it.
    $: profRows = Object.entries(p.proficiency || {})
        .map(([id, games]) => {
            const ch = CHAMPION_BY_ID[id];
            if (!ch) return null;
            const n = Math.max(0, Math.round(Number(games) || 0));
            const pr = proficiency01(n);
            return {
                id, champ: ch, games: n, prof: pr, band: proficiencyBand(pr),
                isSignature: p.champion === id,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.games - a.games || a.champ.name.localeCompare(b.champ.name));
    $: profTotal = profRows.reduce((s, r) => s + r.games, 0);
    $: profMastered = profRows.filter(r => r.prof >= 0.85).length;
    let profAll = false;
    $: profShown = profAll ? profRows : profRows.slice(0, 8);

    // ---- retirement ----------------------------------------------------
    //  Owner-only for the same reason as the switch flow: both actions raise the
    //  retirement overlay and then saveCareer(). On a stranger's dossier there
    //  is nothing to press and nothing is written.
    $: gate = mine ? canRetire(c0) : { ok: false, reason: '', forced: false };

    function openRetire() {
        if (!mine) return;
        if (!gate.ok) {
            playSound('click');
            showToast(gate.reason, 'error');
            return;
        }
        playSound('click');
        pushOverlay('retire', null);
        saveCareer();
    }

    function viewSummary() {
        if (!mine) return;
        playSound('click');
        pushOverlay('retire', null);
        saveCareer();
    }

    // ---- the room ------------------------------------------------------
    //  The five cards the career actually plays with. clubRosterFor() reads only
    //  clubId, time.year and the club block, all of which travel in a dossier.
    //
    //  Gated on boardDBReady(): with no card database getTeamRoster() invents
    //  five synthetic names and never visibly corrects itself, so a viewer would
    //  read fiction as fact.
    /**
     * A club seat, or null when there is nothing renderable in it.
     *
     * Card.svelte does `card.name.slice(0, 2)` and `card.quality.toLowerCase()`
     * with NO guard, and clubRosterFor() hands back whatever a hand-edited save
     * put in club.roster -- careerRender's `club-roster-holds-junk` state parks
     * a bare `{}` in a seat and it reaches the template with a rating and no
     * name. A downloaded dossier cannot do this (board.safeSeatCard rebuilds
     * every foreign seat), so this guards the LOCAL save.
     *
     * Junk renders as an unfilled seat rather than as an invented teammate: the
     * data for that seat is gone, and inventing a name would be a lie.
     */
    function seatCard(card) {
        if (!card || typeof card !== 'object') return null;
        if (typeof card.name !== 'string' || !card.name) return null;
        if (typeof card.quality !== 'string' || !card.quality) return null;
        if (!card.stats || typeof card.stats !== 'object') return null;
        return card;
    }

    $: dbReady = boardDBReady();
    // The GUARDED year, not c0.time.year. clubRosterFor() reads the raw field
    // through `Number(x) || DEFAULT`, which lets a non-finite year straight
    // through and stamps it onto every teammate card -- so the hero card said
    // 2027 and the four beside it said the literal word. Handing over the same
    // `year` the rest of this screen prints keeps the row internally honest.
    $: roomCareer = { ...c0, time: { ...time, year } };
    $: five = clubRosterFor(roomCareer);
    $: mySlot = ROLE_BY_ID[p.role] ? p.role : 'MID';
    // The player sits in their own seat, exactly as Club.svelte draws it --
    // clubRosterFor() fills all five from the club, so without this the dossier
    // would show a phantom second player in the same role.
    $: roomSeats = ROSTER_SLOTS.map(slot => (slot === mySlot
        ? { slot, card: careerCard, me: true }
        : { slot, card: seatCard(five[slot]), me: false }));
    $: roomCoach = seatCard(five.COACH);
    $: momentum = team ? clubMomentum(c0) : 0;
    $: momentumBand = momentumInfo(momentum);
    $: momentumPct = Math.round(((momentum + 1) / 2) * 100);
    $: roomBlock = team ? clubBlock(c0) : null;
    $: roomChanges = (roomBlock && Array.isArray(roomBlock.changes) ? roomBlock.changes : [])
        .filter(x => x && x.role)
        .slice(0, 6);

    function momentumInfo(m) {
        if (m >= 0.55) return { name: 'On a run', color: '#22c55e' };
        if (m >= 0.2) return { name: 'Confident', color: '#3b82f6' };
        if (m > -0.2) return { name: 'Level', color: '#94a3b8' };
        if (m > -0.55) return { name: 'Shaky', color: '#f59e0b' };
        return { name: 'In freefall', color: '#ef4444' };
    }

    const CHANGE_WORD = { cut: 'released', poached: 'bought out', replaced: 'replaced', retired: 'retired' };

    function changeLine(ch) {
        const word = CHANGE_WORD[ch.reason] || 'replaced';
        if (!ch.inName) return `${ch.outName || 'A player'} ${word}`;
        return `${ch.outName || 'A player'} ${word} - ${ch.inName} in`;
    }

    function formChip(card) {
        const d = Math.round(Number(card && card.formDelta) || 0);
        if (!d) return null;
        return { text: (d > 0 ? '+' : '') + d, up: d > 0 };
    }

    /** Card.svelte falls back to the GLOBAL inspectingCard store when it is
     *  given no handler, and CardInspectModal is mounted at the App root outside
     *  both shells -- so an unhandled click really does open an inspector in
     *  career mode, against a card whose id is -1. Every <Card> here is handed
     *  this instead. */
    function noop() {}
</script>

<section class="pf">
    <!-- ============ HERO ============ -->
    <header class="hero panel">
        <!-- onclick is a no-op on purpose, here and on every card below. Without
             a handler Card.svelte writes the global inspectingCard store, and
             CardInspectModal is mounted at the App root OUTSIDE both shells --
             so it really does open over career mode, against a card whose id
             is -1. -->
        <div class="hero-card">
            <!-- onclick is null for the OWNER on purpose. Card.svelte's inspect()
                 early-returns when a handler is present, so passing noop here would
                 silently take away the card-inspect modal that clicking your own
                 hero card has always opened. On a stranger's dossier the handler
                 stays, because that modal is roster UI and the card it would open
                 is a synthetic career card belonging to someone else. -->
            <Card card={careerCard} onclick={mine ? null : noop} />
            <p class="hero-cap">{teamName} &#183; {year} season</p>
        </div>

        <div class="hero-id">
            <div class="id-top">
                <h2 class="id-name">{p.handle || 'Rookie'}</h2>
                <span class="id-flag" aria-hidden="true">{region.flag}</span>
                <span class="tag" style="--k:{role.accent}">{role.short}</span>
                <span class="tag" style="--k:{path.accent}">{path.name}</span>
                {#if retired}
                    <span class="tag" style="--k:#ef4444">Retired</span>
                {/if}
            </div>

            <p class="id-line">
                {ovrLabel(ovr)} {role.name} &#183; {region.name} ({region.league})
                &#183; {years} {years === 1 ? 'year' : 'years'} as a pro
            </p>

            <div class="id-grid">
                <div class="id-cell">
                    <span class="lbl">Age</span>
                    <span class="val">{age}</span>
                    <span class="sub">{band.name}</span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Club</span>
                    <span class="val val-sm" style="color:{teamAccent}">{teamName}</span>
                    <span class="sub">{p.clubId ? statusI.name : 'Unsigned'}</span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Playstyle</span>
                    <span class="val val-sm">{style ? style.name : 'Undecided'}</span>
                    <span class="sub">{styleFocus ? styleFocus + ' growth' : 'No specialism'}</span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Signature Pick</span>
                    <span class="val val-sm">{champ ? champ.name : 'None'}</span>
                    <span class="sub">{champ ? champ.archetype : 'No comfort pick'}</span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Trait</span>
                    <span class="val val-sm">{traits.length ? traits.map(t => t.name).join(', ') : 'Unknown'}</span>
                    <span class="sub">
                        {#if traits.length}
                            {(TRAIT_RARITIES[traits[0].rarity] || TRAIT_RARITIES.common).name}
                        {:else if traitPending}
                            shows itself at {traitRevealAge}
                        {:else}
                            never showed itself
                        {/if}
                    </span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Path</span>
                    <span class="val val-sm">{path.name}</span>
                    <span class="sub">{path.tag}</span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Years Pro</span>
                    <span class="val">{years}</span>
                    <span class="sub">started at {startAge}</span>
                </div>
            </div>

            {#if traits.length}
                <div class="tr-strip">
                    {#each traits as t (t.id)}
                        {@const r = TRAIT_RARITIES[t.rarity] || TRAIT_RARITIES.common}
                        <div class="tr" style="--k:{t.accent || r.color}">
                            <span class="tr-ico" aria-hidden="true">{t.icon}</span>
                            <span class="tr-main">
                                <span class="tr-top">
                                    <span class="tr-name">{t.name}</span>
                                    <span class="tr-rar">{r.name}</span>
                                </span>
                                <span class="tr-blurb">{t.blurb}</span>
                            </span>
                        </div>
                    {/each}
                </div>
            {:else if traitPending && mine}
                <p class="id-contract id-contract-free">
                    Whatever you were born with has not shown itself yet. It will, at {traitRevealAge}.
                </p>
            {:else if traitPending}
                <p class="id-contract id-contract-free">
                    Whatever {whom} was born with has not shown itself yet. It will, at {traitRevealAge}.
                </p>
            {/if}

            {#if p.contract}
                <p class="id-contract">
                    Contracted to {teamName} through {p.contract.endYear || year}
                    {#if p.contract.salary}<span class="dot">&#183;</span> {fmtGold(p.contract.salary)} gold / week{/if}
                </p>
            {:else if mine}
                <p class="id-contract id-contract-free">
                    No contract. Offers arrive through the Transfers screen once scouts rate you.
                </p>
            {:else if p.clubId}
                <p class="id-contract id-contract-free">
                    Contract terms are private. The board publishes the club, never the deal.
                </p>
            {:else}
                <p class="id-contract id-contract-free">
                    No club had {whom} on the books when this career was published.
                </p>
            {/if}
        </div>

        <div class="hero-num">
            <div class="num num-big" style="--k:{tier.color}">
                <span class="num-v">{ovr}</span>
                <span class="num-l">Overall</span>
                <span class="num-s">{ovrLabel(ovr)} &#183; {tier.quality}</span>
            </div>
            <div class="num" style="--k:#a78bfa">
                <span class="num-v">{potOVR}</span>
                <span class="num-l">Potential</span>
                <span class="num-s">{headroom > 0 ? '+' + headroom + ' still to find' : 'Ceiling reached'}</span>
            </div>
            <div class="num" style="--k:#14b8a6">
                <span class="num-v">{fmtGold(mval)}</span>
                <span class="num-l">Market value</span>
                <span class="num-s">what a buyout would cost</span>
            </div>
            <div class="num" style="--k:{rank.color}">
                <span class="num-v num-v-sm">{rank.label}</span>
                <span class="num-l">Solo queue</span>
                <span class="num-s">peak {peakRank.label} &#183; {Math.round(fin(soloq.peakMMR))} MMR</span>
            </div>
            {#if earnings !== null}
                <div class="num" style="--k:#eab308">
                    <span class="num-v">{fmtGold(earnings)}</span>
                    <span class="num-l">Career earnings</span>
                    <span class="num-s">wages and prize money to date</span>
                </div>
            {/if}
        </div>
    </header>

    <!-- ============ ATTRIBUTES + LEGACY ============ -->
    <div class="split">
        <!-- Attributes -->
        <div class="panel pad">
            <div class="slab">Attributes</div>
            {#if mine}
            <p class="note">
                Weights below are for {role.name}. The ghosted part of each bar is your ceiling &#8212;
                no drill ever pushes past it. Moving the ceiling itself takes a breakthrough split,
                the Evergreen perk, or a performance camp.
            </p>
            {:else}
            <p class="note">
                Weights below are for {role.name}. The ghosted part of each bar is the ceiling {whom} was
                born with &#8212; no drill ever pushes past it. Moving the ceiling itself takes a breakthrough
                split, the Evergreen perk, or a performance camp.
            </p>
            {/if}

            <div class="dev">
                <div class="dev-n">&#215;{growth.toFixed(2)}</div>
                <div class="dev-txt">
                    <div class="dev-t">{band.name} &#183; age {age}</div>
                    <!-- ageBand().desc is COACHING ADVICE in the second person
                         ("Train hard", "Lean on knowledge", "Play for the
                         legacy"). It is addressed to whoever is playing, so it
                         is owner-only; the multiplier and the band name are
                         facts about the age curve and stay. -->
                    {#if mine}
                    <div class="dev-d">{band.desc}</div>
                    {/if}
                </div>
                <div class="dev-note">{#if mine}Every training gain is multiplied by this. It drops on every birthday.{:else}Every training gain {whom} makes is multiplied by this. It drops on every birthday.{/if}</div>
            </div>

            <div class="attrs">
                {#each attrRows as a (a.key)}
                    <div class="attr" style="--k:{a.color}">
                        <div class="attr-head">
                            <span class="attr-abbr">{a.abbr}</span>
                            <span class="attr-name">{a.name}</span>
                            <span class="attr-w" title="{a.abbr} is {a.weight}% of a {role.short} overall rating">{a.weight}%</span>
                            <span class="attr-nums"><b>{a.cur}</b><i>/{a.pot}</i></span>
                        </div>
                        <div class="attr-bar" aria-hidden="true">
                            <div class="attr-ghost" style="width:{a.pot}%"></div>
                            <div class="attr-fill" style="width:{a.cur}%"></div>
                        </div>
                        <p class="attr-desc">
                            {a.desc}
                            <span class="attr-room">{a.room > 0 ? `${a.room} left` : 'maxed'}</span>
                        </p>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Legacy -->
        <div class="panel pad legacy" style="--k:{lTier.color}">
            <div class="slab">Legacy</div>
            <div class="lg-head">
                <span class="lg-score">{lScore.toLocaleString()}</span>
                <span class="lg-tier">{lTier.name}</span>
            </div>
            <p class="lg-blurb">{lTier.blurb}</p>
            {#if lEndowed > 0}
                <!-- What the player BOUGHT, stated plainly. The score they are
                     remembered by includes it; the Hall of Legends vote does
                     not, and pretending otherwise would be the dishonest half. -->
                <p class="lg-endow">
                    {lEarned.toLocaleString()} earned, {lEndowed.toLocaleString()} endowed.
                    The Hall of Legends vote counts the earned half only.
                </p>
            {/if}

            {#if nextBand}
                <div class="lg-prog">
                    <div class="lg-prog-bar" aria-hidden="true">
                        <div class="lg-prog-fill" style="width:{bandPct}%"></div>
                    </div>
                    <p class="lg-next">
                        <strong>{toNext.toLocaleString()}</strong> more to reach
                        <span style="color:{nextBand.color}">{nextBand.name}</span>
                    </p>
                </div>
            {:else}
                <p class="lg-next lg-next-top">{#if mine}Nothing above this. The ladder ends with you.{:else}Nothing above this. The ladder ends with {whom}.{/if}</p>
            {/if}

            <div class="slab slab-in">The Ladder</div>
            <ol class="ladder">
                {#each bandRows as b (b.id)}
                    <li
                        class="rung"
                        class:rung-on={b.id === lTier.id}
                        class:rung-done={lScore >= b.min}
                        style="--k:{b.color}"
                    >
                        <span class="rung-min">{b.min.toLocaleString()}+</span>
                        <span class="rung-name">{b.name}</span>
                        {#if b.id === lTier.id}
                            <span class="rung-you">{#if mine}you are here{:else}{whom} is here{/if}</span>
                        {:else if nextBand && b.id === nextBand.id}
                            <span class="rung-need">{toNext.toLocaleString()} to go</span>
                        {/if}
                    </li>
                {/each}
            </ol>
            <p class="note note-tight">
                Titles are worth the most: a World Championship alone is 1,000 points. Games played and peak
                rating fill in the rest.
            </p>
        </div>
    </div>

    <!-- ============ THE ROOM ============
         The five cards this career actually plays with. On a stranger's dossier
         this is the payload -- a scoreboard row becomes a person once you can
         see who they sit next to.

         HONESTY: every org in the mode is a deterministic derivation of
         (teamId, year) out of the card database, and only the seats the club
         itself changed travel in a published career. So this is the squad AS
         THIS BUILD KNOWS IT, which is what the caption says. -->
    <div class="panel pad">
        <div class="slab-row">
            <div class="slab">The Room</div>
            {#if dbReady && team}
                <span class="slab-ct">{teamName} &#183; {year}</span>
            {/if}
        </div>

        {#if !dbReady}
            <!-- Without the card database getTeamRoster() invents five synthetic
                 names and never visibly corrects itself, so five strangers would
                 be presented as this player's teammates. Show nothing instead. -->
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F5C3;</span>
                <p class="empty-t">Card database still loading.</p>
                <p class="empty-p">
                    Every roster in the mode is derived from the card database. Until it is in memory
                    this panel could only show five invented names, so it shows none.
                </p>
            </div>
        {:else if !team}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F6AA;</span>
                <p class="empty-t">No club, no room.</p>
                <p class="empty-p">
                    {mine
                        ? 'You are unsigned. Teammates arrive with a contract; until then every game is one you play on your own.'
                        : `${who} was unsigned when this career was published. Teammates arrive with a contract.`}
                </p>
            </div>
        {:else}
            <div class="room">
                <div class="room-five">
                    {#each roomSeats as seat (seat.slot)}
                        {@const r = ROLE_BY_ID[seat.slot]}
                        {@const chip = seat.me ? null : formChip(seat.card)}
                        <div class="room-seat" class:room-seat-me={seat.me}>
                            <div class="room-seat-top">
                                <span class="room-role" style="--k:{r ? r.accent : '#64748b'}">
                                    {r ? r.short : seat.slot}
                                </span>
                                {#if seat.me}
                                    <span class="room-you">{mine ? 'You' : who}</span>
                                {/if}
                                {#if chip}
                                    <span class="room-form" class:room-form-up={chip.up}>{chip.text}</span>
                                {/if}
                            </div>
                            {#if seat.card}
                                <Card card={seat.card} mini={true} onclick={noop} />
                            {:else}
                                <div class="room-gap">
                                    <span class="room-gap-r">{seat.slot}</span>
                                    <span class="room-gap-t">Seat unfilled</span>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>

                <div class="room-side">
                    <div class="room-mom">
                        <div class="room-mom-head">
                            <span class="room-mom-l">Momentum</span>
                            <span class="room-mom-b" style="--k:{momentumBand.color}">{momentumBand.name}</span>
                        </div>
                        <div class="room-mom-track" role="img" aria-label={'Club momentum: ' + momentumBand.name}>
                            <span class="room-mom-mid" aria-hidden="true"></span>
                            <span class="room-mom-dot" style="left:{momentumPct}%; --k:{momentumBand.color}"></span>
                        </div>
                        <p class="room-mom-note">
                            A club on a run plays a few rating points above itself, and a club falling
                            apart plays below. It moves every teammate on this list.
                        </p>
                    </div>

                    {#if roomCoach}
                        <div class="slab slab-in">Coaching staff</div>
                        <Card card={roomCoach} mini={true} onclick={noop} />
                    {/if}

                    <div class="slab slab-in">Roster moves</div>
                    {#if roomChanges.length}
                        <ul class="moves">
                            {#each roomChanges as ch, i (ch.year + '-' + ch.role + '-' + i)}
                                <li class="move">
                                    <span class="move-y">{ch.year}</span>
                                    <span class="move-r">{ch.role}</span>
                                    <span class="move-t">{changeLine(ch)}</span>
                                </li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="note note-tight">
                            Nobody has moved since {mine ? 'you' : who} got here. Orgs make their changes
                            in the offseason, and a bad season is when they make the most of them.
                        </p>
                    {/if}
                </div>
            </div>

            <p class="note note-tight">
                Rosters are re-derived from the card database every time this page is drawn, so this is
                {teamName} as this build knows it &#8212; not a photograph. Only the seats the club itself
                changed, and how the room is going, are carried with a career.
            </p>
        {/if}
    </div>

    <!-- ============ SIGNATURE CHAMPION ============
         Re-maining. The pool is gated by playstyle, because the comfort bonus
         in the match engine is scored on exactly that agreement -- a Weakside
         Specialist maining Fiora is quietly worse at the game and never told
         why. Priced in champion pool and form rather than gold: it is the one
         cost that touches the system the champion belongs to. -->
    <div class="panel pad sig">
        <div class="slab">Signature Pick</div>

        <div class="sig-now" style="--k:{champ ? role.accent : '#64748b'}">
            <span class="sig-name">{champ ? champ.name : 'No signature pick'}</span>
            <span class="sig-meta">
                {#if champ}
                    {champ.archetype}
                    {#if style}<span class="dot">&#183;</span> {style.name}{/if}
                {:else if mine}
                    You draft without a comfort pick. Every game is off-script.
                {:else}
                    {who} drafts without a comfort pick. Every game is off-script.
                {/if}
            </span>
            {#if champOffStyle && mine}
                <span class="sig-warn">
                    Off-style. This pick predates the playstyle rule and is yours to keep,
                    but it earns you less comfort than one that suits {style.name}.
                </span>
            {:else if champOffStyle}
                <span class="sig-warn">
                    Off-style. This pick predates the playstyle rule and is theirs to keep,
                    but it earns {whom} less comfort than one that suits {style.name}.
                </span>
            {/if}
        </div>

        {#if retired && mine}
            <p class="note">Your playing career is over. Nobody is asking what you play any more.</p>
        {:else if retired}
            <p class="note">{who} stopped playing. Nobody is asking what they play any more.</p>
        {:else if !mine}
            <p class="note">
                Still playing, and still drafting around this one. The pool a player may main is
                decided by their playstyle, which is what the match engine pays the comfort bonus on.
            </p>
        {:else if !switching}
            <p class="note">
                {switchGate.ok
                    ? switchGate.reason
                    : switchGate.reason}
            </p>
            <div class="sig-acts">
                <button class="sig-btn" on:click={openSwitch} disabled={!switchGate.ok}>
                    {champ ? 'Change your main' : 'Pick a main'}
                </button>
            </div>
        {:else}
            <p class="note">
                Only champions a {style ? style.name : 'player of your style'} would actually play.
                Nearest fit first.
            </p>

            <div class="sig-grid">
                {#each switchPool as ch (ch.id)}
                    <button
                        class="sig-opt"
                        class:sig-opt-on={switchPick === ch.id}
                        on:click={() => pickSwitch(ch.id)}
                    >
                        <span class="sig-opt-n">{ch.name}</span>
                        <span class="sig-opt-a">{ch.archetype}</span>
                    </button>
                {:else}
                    <p class="note">Nothing else your playstyle would let you play.</p>
                {/each}
            </div>

            {#if switchPreview && switchPreview.ok}
                <div class="sig-prev">
                    <div class="sig-prev-row">
                        <span class="sig-prev-l">Champion Pool</span>
                        <span class="sig-prev-v">
                            {switchPreview.chpBefore} &#8594; <b>{switchPreview.chpAfter}</b>
                        </span>
                    </div>
                    <div class="sig-prev-row">
                        <span class="sig-prev-l">Overall</span>
                        <span class="sig-prev-v">
                            {switchPreview.ovrBefore} &#8594; <b>{switchPreview.ovrAfter}</b>
                        </span>
                    </div>
                    <div class="sig-prev-row">
                        <span class="sig-prev-l">Form</span>
                        <span class="sig-prev-v">
                            {Math.round(p.form)} &#8594; <b>{Math.round(switchPreview.formAfter)}</b>
                        </span>
                    </div>
                    <p class="sig-prev-note">
                        Weeks of one-tricking somebody else. Your pool gets narrower, which is what
                        decides whether you keep your pick through a ban phase &#8212; and it does not
                        come back on its own.
                    </p>
                </div>
            {:else if switchPreview && switchPreview.reason}
                <p class="note">{switchPreview.reason}</p>
            {/if}

            <div class="sig-acts">
                <button class="sig-btn sig-btn-go" on:click={commitSwitch} disabled={!switchPreview || !switchPreview.ok}>
                    {switchPreview && switchPreview.ok ? `Main ${switchPreview.to.name}` : 'Pick one'}
                </button>
                <button class="sig-btn" on:click={cancelSwitch}>Not yet</button>
            </div>
        {/if}
    </div>

    <!-- ============ CHAMPION PROFICIENCY ============ -->
    <div class="panel pad">
        <div class="slab-row">
            <div class="slab">Champion Proficiency</div>
            {#if profRows.length > 8}
                <button class="lnk" on:click={() => (profAll = !profAll)}>
                    {profAll ? 'Show top 8' : `Show all ${profRows.length}`}
                </button>
            {/if}
        </div>

        {#if profRows.length}
            {#if mine}
            <p class="note">
                Every game you play on a champion is banked against it. A champion you barely know
                costs you on every call; one you have mastered stops costing you and holds up in a
                losing lane. {profTotal} {profTotal === 1 ? 'game' : 'games'} across
                {profRows.length} {profRows.length === 1 ? 'champion' : 'champions'}{profMastered
                    ? `, ${profMastered} mastered` : ''}.
            </p>
            {:else}
            <p class="note">
                Every game played on a champion is banked against it. A champion barely known
                costs a player on every call; one they have mastered stops costing them and holds up in a
                losing lane. {profTotal} {profTotal === 1 ? 'game' : 'games'} across
                {profRows.length} {profRows.length === 1 ? 'champion' : 'champions'}{profMastered
                    ? `, ${profMastered} mastered` : ''}.
            </p>
            {/if}

            <div class="prof">
                {#each profShown as r (r.id)}
                    <div class="pf-row" style="--k:{r.band.color}">
                        <span class="pf-name">
                            {r.champ.name}
                            {#if r.isSignature}<span class="pf-sig">Signature</span>{/if}
                        </span>
                        <span class="pf-arch">{r.champ.archetype}</span>
                        <span class="pf-bar" aria-hidden="true">
                            <span class="pf-fill" style="width:{Math.round(r.prof * 100)}%"></span>
                        </span>
                        <span class="pf-band">{r.band.name}</span>
                        <span class="pf-games">{r.games}</span>
                    </div>
                {/each}
            </div>
        {:else if mine}
            <p class="note">
                Nothing played yet. Champion select offers you three picks before every game, and
                every one you play is recorded here.
            </p>
        {:else}
            <p class="note">
                Nothing played yet. Champion select offers three picks before every game, and every
                one played is recorded here.
            </p>
        {/if}
    </div>

    <!-- ============ CAREER TOTALS ============ -->
    <div class="panel pad">
        <div class="slab">Career Totals</div>
        {#if (t.games || 0) === 0}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F4CA;</span>
                <p class="empty-t">No professional games yet.</p>
                <p class="empty-p">
                    {#if mine}
                    {p.clubId
                        ? 'Your record starts with the first fixture you are named in. Check the Season screen for the games this week.'
                        : 'Nothing counts until a club signs you. Climb solo queue and take an offer from the Transfers screen.'}
                    {:else}
                    {p.clubId
                        ? `${who} is on a roster but has not been named in a fixture yet. The record starts with the first one.`
                        : `Nothing counts until a club signs ${whom}. So far nobody has.`}
                    {/if}
                </p>
            </div>
        {:else}
            <div class="tiles">
                <div class="tile">
                    <span class="t-v">{t.games}</span>
                    <span class="t-l">Games</span>
                </div>
                <div class="tile">
                    <span class="t-v">{fmtRecord(t.wins, t.losses)}</span>
                    <span class="t-l">Record</span>
                </div>
                <div class="tile" style="--k:{winRate >= 55 ? '#22c55e' : winRate >= 45 ? '#3b82f6' : '#ef4444'}">
                    <span class="t-v t-k">{winRate}%</span>
                    <span class="t-l">Win rate</span>
                </div>
                <div class="tile">
                    <span class="t-v t-v-sm">{kda.line}</span>
                    <span class="t-l">K / D / A</span>
                    <span class="t-s">{kda.ratio} ratio</span>
                </div>
                <div class="tile" style="--k:{ratingTone(avgRating)}">
                    <span class="t-v t-k">{avgRating.toFixed(2)}</span>
                    <span class="t-l">Avg match rating</span>
                    <span class="t-s">out of 10</span>
                </div>
                <div class="tile" style="--k:#eab308">
                    <span class="t-v t-k">{t.mvps || 0}</span>
                    <span class="t-l">Match MVPs</span>
                    {#if (t.pentakills || 0) > 0}
                        <span class="t-s">{t.pentakills} pentakill{t.pentakills === 1 ? '' : 's'}</span>
                    {/if}
                </div>
                <div class="tile" style="--k:{ovrTier(peak).color}">
                    <span class="t-v t-k">{peak}</span>
                    <span class="t-l">Peak overall</span>
                    <span class="t-s">{ovrLabel(peak)}</span>
                </div>
            </div>
        {/if}
    </div>

    <!-- ============ HONOURS + MILESTONES ============ -->
    <div class="split split-even">
        <!-- Honours -->
        <div class="panel pad">
            <div class="slab-row">
                <div class="slab">Honours</div>
                {#if awardCount > 0}
                    <span class="slab-ct">{awardCount} award{awardCount === 1 ? '' : 's'} &#183; {awardLegacy} legacy points</span>
                {/if}
            </div>

            {#if awardCount === 0 && trophyCount === 0 && mine}
                <div class="empty">
                    <span class="empty-ico" aria-hidden="true">&#x1F3C6;</span>
                    <p class="empty-t">The cabinet is empty.</p>
                    <p class="empty-p">
                        Awards are voted at the end of every split &#8212; All-Pro selections, MVPs, and the
                        titles that come with winning playoffs. Play a full split with a club to be eligible.
                    </p>
                </div>
            {:else if awardCount === 0 && trophyCount === 0}
                <div class="empty">
                    <span class="empty-ico" aria-hidden="true">&#x1F3C6;</span>
                    <p class="empty-t">The cabinet is empty.</p>
                    <p class="empty-p">
                        Awards are voted at the end of every split &#8212; All-Pro selections, MVPs, and the
                        titles that come with winning playoffs. {who} has not won one yet.
                    </p>
                </div>
            {:else}
                {#if trophies.length}
                    <!-- THE CABINET. Grouped by honour rather than one chip per
                         win, so six regional titles read as one plate with six
                         dated wins instead of six identical chips. Built from
                         the awards list, which is the only place the split and
                         the club survive - and it works for a stranger's career
                         because every name, icon and colour is re-resolved
                         locally. -->
                    {#each cabinet as sh (sh.id)}
                        {#if sh.total > 0}
                            <div class="cab">
                                <p class="cab-h" style="--k:{sh.accent}">
                                    <span>{sh.name}</span>
                                    <span class="cab-ct">{sh.total}</span>
                                </p>
                                <div class="shelf">
                                    {#each sh.plates as pl (pl.id)}
                                        <div class="troph" style="--k:{toneOf(pl.tier)}"
                                             title="{pl.name}{pl.count > 1 ? ` ×${pl.count}` : ''}">
                                            <span class="troph-ico" aria-hidden="true">{pl.icon}</span>
                                            <span class="troph-n">{pl.name}</span>
                                            {#if pl.count > 1}<span class="troph-x">&#215;{pl.count}</span>{/if}
                                            <span class="troph-w">
                                                {#each pl.wins.slice(0, 4) as w, i (w.year + '-' + i)}
                                                    <span class="troph-win">
                                                        {w.year}{#if w.splitName}&nbsp;{w.splitName}{/if}{#if w.teamName}
                                                            <span class="troph-team">{w.teamName}</span>{/if}
                                                    </span>
                                                {/each}
                                                {#if pl.wins.length > 4}
                                                    <span class="troph-win troph-more">+{pl.wins.length - 4} more</span>
                                                {/if}
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    {/each}
                {/if}

                {#if trophiesUnlisted > 0}
                    <!-- A dossier's honours list is trimmed oldest-first to fit
                         the blob budget; the COUNT is carried separately and is
                         always right, so say so rather than quietly under-report. -->
                    <p class="note note-tight">
                        {trophiesUnlisted} older {trophiesUnlisted === 1 ? 'trophy' : 'trophies'} did not fit
                        in the published record &#8212; {trophyCount} in total.
                    </p>
                {/if}

                {#each awardYears as yr (yr.year)}
                    <div class="yr">
                        <div class="yr-head">
                            <span class="yr-y">{yr.year}</span>
                            <span class="yr-line" aria-hidden="true"></span>
                            <span class="yr-lp">+{yr.legacyPoints} legacy</span>
                        </div>
                        <ul class="aw-list">
                            {#each yr.awards as a, i (a.id + '-' + i)}
                                <li class="aw" style="--k:{toneOf(a.tier)}">
                                    <span class="aw-ico" aria-hidden="true">{a.icon}</span>
                                    <span class="aw-body">
                                        <span class="aw-n">{a.name}</span>
                                        <span class="aw-m">
                                            {TIER_NAME[a.tier] || 'Minor'}
                                            {#if a.splitName}<span class="dot">&#183;</span>{a.splitName}{/if}
                                            {#if a.teamName}<span class="dot">&#183;</span>{a.teamName}{/if}
                                        </span>
                                    </span>
                                    {#if a.legacyPoints}<span class="aw-lp">+{a.legacyPoints}</span>{/if}
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/each}
            {/if}
        </div>

        <!-- Milestones -->
        <div class="panel pad">
            <div class="slab-row">
                <div class="slab">Milestones</div>
                <span class="slab-ct">{msDone} / {MILESTONES.length} complete</span>
            </div>

            <div class="ms-bar" aria-hidden="true">
                <div class="ms-bar-fill" style="width:{(msDone / MILESTONES.length) * 100}%"></div>
            </div>

            <div class="filters" role="group" aria-label="Filter milestones">
                {#each [['all', 'All'], ['todo', 'Targets'], ['done', 'Complete']] as [id, label]}
                    <button
                        class="fbtn"
                        class:fbtn-on={msFilter === id}
                        aria-pressed={msFilter === id}
                        on:click={() => setFilter(id)}
                    >{label}</button>
                {/each}
            </div>

            {#if msShown.length === 0}
                <div class="empty empty-sm">
                    <p class="empty-p">
                        {msFilter === 'done'
                            ? 'Nothing banked yet. Every milestone below is still available.'
                            : 'Every milestone is complete. There is nothing left on this list.'}
                    </p>
                </div>
            {:else}
                <ul class="ms-list">
                    {#each msShown as m (m.id)}
                        <li class="ms" class:ms-done={m.done}>
                            <span class="ms-ico" aria-hidden="true">{m.icon}</span>
                            <span class="ms-body">
                                <span class="ms-n">{m.name}</span>
                                <span class="ms-d">{m.desc}</span>
                            </span>
                            <span class="ms-rw">
                                {#if m.done}
                                    <span class="ms-tick" aria-label="Complete">&#x2713; done</span>
                                {:else}
                                    {#if m.gold > 0}<span class="ms-gold">{fmtGold(m.gold)}g</span>{/if}
                                    <span class="ms-leg">+{m.legacyPoints}</span>
                                {/if}
                            </span>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>

    <!-- ============ SEASON HISTORY ============ -->
    <div class="panel pad">
        <div class="slab-row">
            <div class="slab">Season History</div>
            {#if historyRows.length}
                <span class="slab-ct">{historyRows.length} split{historyRows.length === 1 ? '' : 's'} on record</span>
            {/if}
        </div>

        {#if historyRows.length === 0}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F4C5;</span>
                <p class="empty-t">No completed splits yet.</p>
                {#if mine}
                <p class="empty-p">
                    A season is written here the moment a split rolls over &#8212; the club you played it for,
                    the record, where you finished and anything you won along the way.
                </p>
                {:else}
                <p class="empty-p">
                    A season is written here the moment a split rolls over &#8212; the club it was played for,
                    the record, where they finished and anything won along the way.
                </p>
                {/if}
            </div>
        {:else}
            <div class="tbl-wrap">
                <table class="tbl">
                    <thead>
                        <tr>
                            <th scope="col">Year</th>
                            <th scope="col">Split</th>
                            <th scope="col">Team</th>
                            <th scope="col">Record</th>
                            <th scope="col">Finish</th>
                            <th scope="col">Honours</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each historyRows as h (h.key)}
                            <tr>
                                <td class="td-y">{h.year || DASH}</td>
                                <td>{h.splitName}</td>
                                <td class="td-team" style="color:{h.teamAccent}">{h.teamName}</td>
                                <td class="td-mono">{fmtRecord(h.w, h.l)}</td>
                                <td class="td-mono">{h.placement > 0 ? ordinal(h.placement) : DASH}</td>
                                <td>
                                    {#if h.awards.length}
                                        <span class="td-aw">
                                            {#each h.awards as a, i (a.id + '-' + i)}
                                                <span class="td-chip" style="--k:{toneOf(a.tier)}" title={a.name}>
                                                    <span aria-hidden="true">{a.icon}</span>{a.name}
                                                </span>
                                            {/each}
                                        </span>
                                    {:else}
                                        <span class="td-none">&#8212;</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>

    <!-- ============ RETIREMENT ============
         OWNER ONLY. Both buttons call pushOverlay() and then saveCareer(), so
         on a stranger's dossier this becomes a written epitaph with nothing to
         press -- the same facts, none of the writes. -->
    <div class="panel pad retire" class:retire-open={mine && gate.ok && !retired}>
        <div class="slab">{mine ? 'Retirement' : (retired ? 'Where it ended' : 'Where it stands')}</div>
        <div class="ret-in">
            <div class="ret-txt">
                {#if retired && mine}
                    <p class="ret-h">Your career is over.</p>
                    <p class="ret-p">
                        {p.handle} finished at {age} with {t.games || 0} games and a legacy score of
                        {lScore.toLocaleString()} &#8212; {lTier.name}. Nothing on this page will change again.
                    </p>
                {:else if retired}
                    <p class="ret-h">The career is over.</p>
                    <p class="ret-p">
                        {who} finished at {age} with {t.games || 0} games and a legacy score of
                        {lScore.toLocaleString()} &#8212; {lTier.name}. Nothing on this page will change again.
                    </p>
                {:else if !mine}
                    <p class="ret-h">Still playing.</p>
                    <p class="ret-p">
                        {who} is {age} and has not retired. Everything above is the career as it stood
                        when it was last published to the board, not a finished one.
                    </p>
                {:else if gate.ok}
                    <p class="ret-h">{gate.forced ? 'The game has decided for you.' : 'You can walk away.'}</p>
                    <p class="ret-p">
                        {gate.reason} Retiring closes the save for good: the summary is written, the Hall of
                        Legends vote is taken, and there is no un-retiring afterwards.
                    </p>
                {:else}
                    <p class="ret-h">Not yet.</p>
                    <p class="ret-p">
                        {gate.reason} Retirement opens at {RETIREMENT_AGE_MIN}, and the longer you play the more
                        legacy there is to bank.
                    </p>
                {/if}
            </div>
            {#if mine}
            <div class="ret-act">
                {#if retired}
                    <button class="btn-secondary" on:click={viewSummary}>View career summary</button>
                {:else}
                    <button
                        class="ret-btn"
                        class:ret-btn-off={!gate.ok}
                        aria-disabled={!gate.ok}
                        on:click={openRetire}
                    >
                        Retire{gate.ok ? '' : ' ' + DASH + ' locked'}
                    </button>
                    <span class="ret-note">{gate.ok ? 'You will be asked to confirm.' : `Available from age ${RETIREMENT_AGE_MIN}.`}</span>
                {/if}
            </div>
            {/if}
        </div>
    </div>
</section>

<style>
    .pf { display: flex; flex-direction: column; gap: 18px; max-width: 1360px; margin: 0 auto; width: 100%; }
    .panel { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.32); border-radius: 18px; }
    .pad { padding: 20px; }

    .slab { font-size: 9.5px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #3f5069; margin-bottom: 12px; }
    .slab-in { margin-top: 18px; }
    .slab-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .slab-ct { font-size: 10px; font-weight: 700; letter-spacing: 0.4px; color: #4a5b76; margin-bottom: 12px; }
    .note { font-size: 11.5px; line-height: 1.6; color: #56688a; margin: 0 0 14px; }

    /* ---- champion proficiency ---- */
    .lnk {
        font-family: inherit; font-size: 11px; font-weight: 700;
        padding: 5px 11px; border-radius: 7px; cursor: pointer;
        color: #7d93b8; background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.4);
        transition: color 0.15s ease, border-color 0.15s ease;
    }
    .lnk:hover { color: #cbd5e1; border-color: rgba(71, 85, 105, 0.7); }
    .prof { display: flex; flex-direction: column; gap: 6px; }
    .pf-row {
        display: grid;
        grid-template-columns: minmax(110px, 1.3fr) minmax(70px, 0.9fr) minmax(80px, 1.6fr) 74px 42px;
        align-items: center; gap: 10px;
        padding: 8px 12px; border-radius: 9px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.32);
    }
    .pf-name {
        display: flex; align-items: center; gap: 7px;
        font-size: 13px; font-weight: 700; color: #cbd5e1;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pf-sig {
        font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
        padding: 2px 5px; border-radius: 4px; flex-shrink: 0;
        color: #fbbf24; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.28);
    }
    .pf-arch { font-size: 10.5px; color: #4e5f7a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pf-bar { height: 5px; border-radius: 99px; background: rgba(15, 23, 42, 0.85); overflow: hidden; }
    .pf-fill { display: block; height: 100%; border-radius: 99px; background: var(--k); }
    .pf-band { font-size: 10.5px; font-weight: 700; color: var(--k); text-align: right; }
    .pf-games {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; color: #56688a; text-align: right;
    }
    @media (max-width: 620px) {
        .pf-row { grid-template-columns: 1fr 60px 40px; }
        .pf-arch, .pf-bar { display: none; }
    }

    /* ---- genetic traits ---- */
    .tr-strip { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .tr {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 12px 14px; border-radius: 12px;
        background: color-mix(in srgb, var(--k) 7%, rgba(15, 23, 42, 0.45));
        border: 1px solid color-mix(in srgb, var(--k) 28%, transparent);
    }
    .tr-ico { font-size: 22px; line-height: 1.1; flex-shrink: 0; }
    .tr-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .tr-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
    .tr-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 14px; font-weight: 700; color: #e2e8f0;
    }
    .tr-rar {
        font-size: 8.5px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--k);
    }
    .tr-blurb { font-size: 11.5px; line-height: 1.6; color: #64769a; }

    /* ---- signature champion ---- */
    .sig-now {
        display: flex; flex-direction: column; gap: 5px;
        padding: 14px 16px; margin-bottom: 14px; border-radius: 12px;
        background: color-mix(in srgb, var(--k) 6%, rgba(15, 23, 42, 0.45));
        border: 1px solid color-mix(in srgb, var(--k) 26%, transparent);
    }
    .sig-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 18px; font-weight: 700; color: #e8eefb;
    }
    .sig-meta { font-size: 11.5px; color: #64769a; }
    .sig-warn {
        margin-top: 5px; font-size: 11px; line-height: 1.6; color: #fbbf24;
    }

    .sig-acts { display: flex; flex-wrap: wrap; gap: 9px; }
    .sig-btn {
        font-family: inherit; font-size: 12px; font-weight: 700;
        padding: 10px 18px; border-radius: 9px; cursor: pointer;
        color: #94a3b8; background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(51, 65, 85, 0.5);
        transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    }
    .sig-btn:hover:not(:disabled) { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.75); background: rgba(30, 41, 59, 0.6); }
    .sig-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .sig-btn-go {
        color: #fca5a5; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.32);
    }
    .sig-btn-go:hover:not(:disabled) { color: #fecaca; background: rgba(239, 68, 68, 0.16); border-color: rgba(239, 68, 68, 0.5); }

    .sig-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
        gap: 7px; margin-bottom: 14px;
    }
    .sig-opt {
        display: flex; flex-direction: column; gap: 2px; text-align: left;
        font-family: inherit; padding: 9px 11px; border-radius: 9px; cursor: pointer;
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.4);
        transition: border-color 0.14s ease, background 0.14s ease;
    }
    .sig-opt:hover { border-color: rgba(71, 85, 105, 0.7); background: rgba(30, 41, 59, 0.5); }
    .sig-opt-on { border-color: rgba(139, 92, 246, 0.6); background: rgba(139, 92, 246, 0.12); }
    .sig-opt-n { font-size: 12.5px; font-weight: 700; color: #cbd5e1; }
    .sig-opt-a { font-size: 10px; color: #56688a; }

    .sig-prev {
        padding: 13px 15px; margin-bottom: 14px; border-radius: 11px;
        background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.45);
    }
    .sig-prev-row {
        display: flex; align-items: baseline; justify-content: space-between;
        gap: 12px; padding: 4px 0;
    }
    .sig-prev-l { font-size: 11px; color: #56688a; }
    .sig-prev-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12.5px; color: #7d93b8; }
    .sig-prev-v b { color: #f87171; font-weight: 700; }
    .sig-prev-note { margin: 9px 0 0; font-size: 11px; line-height: 1.6; color: #56688a; }
    .note-tight { margin: 12px 0 0; font-size: 11px; }
    .dot { color: #2c3a52; margin: 0 5px; }

    /* ---------- HERO ---------- */
    .hero {
        display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(200px, 260px);
        gap: 26px; padding: 22px; align-items: start;
    }
    .hero-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .hero-cap { font-size: 9.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; margin: 0; text-align: center; }

    .hero-id { min-width: 0; }
    .id-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .id-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 30px; font-weight: 700; letter-spacing: -0.02em;
        color: #e8eefb; margin: 0; line-height: 1.05;
    }
    .id-flag { font-size: 17px; line-height: 1; }
    .tag {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 4px 8px; border-radius: 6px; white-space: nowrap; color: var(--k);
        background: color-mix(in srgb, var(--k) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--k) 30%, transparent);
    }
    .id-line { font-size: 12px; font-weight: 600; color: #56688a; margin: 10px 0 16px; line-height: 1.5; }

    .id-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
    .id-cell {
        display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 12px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.26); min-width: 0;
    }
    .lbl { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #334155; }
    .val { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 17px; font-weight: 800; color: #e2e8f0; line-height: 1.1; }
    .val-sm {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13.5px; font-weight: 700;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sub { font-size: 10px; font-weight: 600; color: #4a5b76; }
    .id-contract { margin: 14px 0 0; font-size: 11.5px; font-weight: 600; color: #64748b; }
    .id-contract-free { color: #4a5b76; font-style: italic; }

    .hero-num { display: flex; flex-direction: column; gap: 10px; }
    .num {
        display: flex; flex-direction: column; gap: 2px; padding: 11px 14px; border-radius: 12px;
        background: color-mix(in srgb, var(--k, #64748b) 8%, rgba(15,23,42,0.55));
        border: 1px solid color-mix(in srgb, var(--k, #64748b) 26%, transparent);
    }
    .num-big { padding: 14px; }
    .num-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 26px; font-weight: 800; line-height: 1; color: var(--k, #e2e8f0); }
    .num-big .num-v { font-size: 40px; }
    .num-v-sm { font-size: 16px; }
    .num-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: #3f5069; margin-top: 4px; }
    .num-s { font-size: 10px; font-weight: 600; color: #4a5b76; }

    /* ---------- SPLIT LAYOUT ---------- */
    .split { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 18px; align-items: start; }
    .split-even { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }

    /* ---------- ATTRIBUTES ---------- */
    .dev {
        display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 12px;
        background: rgba(139,92,246,0.07); border: 1px solid rgba(139,92,246,0.22);
        margin-bottom: 16px; flex-wrap: wrap;
    }
    .dev-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 24px; font-weight: 800; color: #a78bfa; line-height: 1; }
    .dev-txt { min-width: 0; }
    .dev-t { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .dev-d { font-size: 11px; font-weight: 600; color: #56688a; margin-top: 2px; }
    .dev-note { margin-left: auto; font-size: 10px; font-weight: 600; color: #3f5069; max-width: 230px; line-height: 1.5; }

    .attrs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px 20px; }
    .attr { min-width: 0; }
    .attr-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
    .attr-abbr {
        font-size: 9px; font-weight: 800; letter-spacing: 1.1px; color: var(--k);
        padding: 3px 6px; border-radius: 5px; background: color-mix(in srgb, var(--k) 12%, transparent);
    }
    .attr-name { font-size: 12px; font-weight: 700; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .attr-w { font-size: 9.5px; font-weight: 800; color: #3f5069; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    .attr-nums { margin-left: auto; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; white-space: nowrap; }
    .attr-nums b { font-size: 14px; font-weight: 800; color: #e2e8f0; }
    .attr-nums i { font-style: normal; color: #3f5069; margin-left: 2px; }
    .attr-bar { position: relative; height: 6px; border-radius: 4px; background: rgba(148,163,184,0.09); overflow: hidden; }
    .attr-ghost { position: absolute; inset: 0 auto 0 0; height: 100%; border-radius: 4px; background: color-mix(in srgb, var(--k) 24%, transparent); }
    .attr-fill { position: absolute; inset: 0 auto 0 0; height: 100%; border-radius: 4px; background: var(--k); transition: width 0.35s ease; }
    .attr-desc { font-size: 10.5px; line-height: 1.5; color: #46587a; margin: 6px 0 0; }
    .attr-room { color: var(--k); font-weight: 700; white-space: nowrap; margin-left: 4px; opacity: 0.85; }

    /* ---------- LEGACY ---------- */
    .legacy { border-color: color-mix(in srgb, var(--k) 26%, rgba(51,65,85,0.32)); }
    .lg-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .lg-score { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 42px; font-weight: 800; line-height: 1; color: var(--k); }
    .lg-tier { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #e2e8f0; }
    .lg-blurb { font-size: 11.5px; line-height: 1.6; color: #56688a; margin: 10px 0 14px; }
    .lg-endow { font-size: 10.5px; line-height: 1.55; color: #475569; margin: -8px 0 14px; }
    .lg-prog-bar { height: 5px; border-radius: 4px; background: rgba(148,163,184,0.1); overflow: hidden; }
    .lg-prog-fill { height: 100%; border-radius: 4px; background: var(--k); transition: width 0.4s ease; }
    .lg-next { font-size: 11px; font-weight: 600; color: #56688a; margin: 8px 0 0; }
    .lg-next strong { font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: #e2e8f0; font-weight: 800; }
    .lg-next-top { color: var(--k); font-weight: 700; }

    .ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .rung {
        display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 9px;
        border: 1px solid transparent; background: rgba(15,23,42,0.4); opacity: 0.5;
    }
    .rung-done { opacity: 1; }
    .rung-on {
        background: color-mix(in srgb, var(--k) 12%, rgba(15,23,42,0.5));
        border-color: color-mix(in srgb, var(--k) 34%, transparent); opacity: 1;
    }
    .rung-min { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 700; color: #3f5069; min-width: 56px; }
    .rung-name { font-size: 12px; font-weight: 700; color: var(--k); flex: 1; min-width: 0; }
    .rung-you, .rung-need { font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
    .rung-you { color: var(--k); }
    .rung-need { color: #4a5b76; }

    /* ---------- THE ROOM ---------- */
    .room { display: grid; grid-template-columns: minmax(0, 1fr) minmax(210px, 260px); gap: 18px; align-items: start; }
    .room-five { display: flex; flex-wrap: wrap; gap: 12px; }
    .room-seat { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .room-seat-top { display: flex; align-items: center; gap: 6px; min-height: 20px; }
    .room-role {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px; color: var(--k);
        background: color-mix(in srgb, var(--k) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--k) 28%, transparent);
    }
    .room-you {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        color: #a78bfa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 96px;
    }
    .room-form {
        margin-left: auto; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 800; color: #ef4444;
    }
    .room-form-up { color: #22c55e; }
    .room-gap {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
        width: 180px; height: 214px; border-radius: 14px;
        background: rgba(15,23,42,0.35); border: 1px dashed rgba(51,65,85,0.4);
    }
    .room-gap-r { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 15px; font-weight: 800; color: #334155; }
    .room-gap-t { font-size: 10px; font-weight: 600; color: #3f5069; }

    .room-side { min-width: 0; }
    .room-mom {
        padding: 12px 14px; border-radius: 12px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.26);
    }
    .room-mom-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .room-mom-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #334155; }
    .room-mom-b { font-size: 11px; font-weight: 800; color: var(--k); }
    .room-mom-track { position: relative; height: 5px; margin: 10px 0 0; border-radius: 99px; background: rgba(148,163,184,0.12); }
    .room-mom-mid { position: absolute; left: 50%; top: -3px; width: 1px; height: 11px; background: rgba(148,163,184,0.28); }
    .room-mom-dot {
        position: absolute; top: 50%; width: 9px; height: 9px; border-radius: 50%;
        transform: translate(-50%, -50%); background: var(--k);
        box-shadow: 0 0 8px color-mix(in srgb, var(--k) 60%, transparent);
    }
    .room-mom-note { margin: 10px 0 0; font-size: 10.5px; line-height: 1.55; color: #46587a; }

    .moves { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
    .move {
        display: grid; grid-template-columns: 40px 34px minmax(0, 1fr); align-items: baseline; gap: 8px;
        padding: 7px 10px; border-radius: 9px;
        background: rgba(15,23,42,0.45); border: 1px solid rgba(51,65,85,0.24);
    }
    .move-y { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 800; color: #3f5069; }
    .move-r { font-size: 9px; font-weight: 800; letter-spacing: 0.8px; color: #64748b; }
    .move-t { font-size: 10.5px; font-weight: 600; color: #7d93b8; line-height: 1.45; }

    /* ---------- TILES ---------- */
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 12px; }
    .tile {
        display: flex; flex-direction: column; gap: 3px; padding: 14px; border-radius: 12px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.26); min-width: 0;
    }
    .t-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 24px; font-weight: 800; line-height: 1.05; color: #e8eefb; }
    .t-v-sm { font-size: 17px; }
    .t-k { color: var(--k, #e8eefb); }
    .t-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; margin-top: 3px; }
    .t-s { font-size: 10px; font-weight: 600; color: #4a5b76; }

    /* ---------- HONOURS ---------- */
    .cab { margin-bottom: 16px; }
    .cab-h {
        display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
        font-size: 9px; font-weight: 800; letter-spacing: 1.8px;
        text-transform: uppercase; color: var(--k);
    }
    .cab-h::after {
        content: ''; flex: 1; height: 1px;
        background: color-mix(in srgb, var(--k) 22%, transparent);
    }
    .cab-ct {
        font-size: 9px; font-weight: 800; color: #64748b;
        background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.4);
        padding: 1px 7px; border-radius: 5px; letter-spacing: 0;
    }
    .troph-x {
        font-size: 10px; font-weight: 900; color: var(--k);
        background: color-mix(in srgb, var(--k) 16%, transparent);
        padding: 1px 5px; border-radius: 4px;
    }
    .troph-w { display: flex; flex-wrap: wrap; gap: 4px; }
    .troph-win {
        font-size: 9px; font-weight: 700; color: #64748b;
        background: rgba(2, 6, 23, 0.45); padding: 2px 6px; border-radius: 5px;
        white-space: nowrap;
    }
    .troph-team { color: #475569; font-weight: 600; }
    .troph-more { color: #475569; font-style: italic; }

    .shelf { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .troph {
        display: flex; align-items: center; gap: 7px; padding: 7px 10px; border-radius: 10px; max-width: 100%;
        background: color-mix(in srgb, var(--k) 9%, rgba(15,23,42,0.5));
        border: 1px solid color-mix(in srgb, var(--k) 28%, transparent);
    }
    .troph-ico { font-size: 15px; line-height: 1; }
    .troph-n { font-size: 11px; font-weight: 700; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .troph-y { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 700; color: var(--k); }

    .yr { margin-top: 14px; }
    .yr-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .yr-y { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; color: #cbd5e1; }
    .yr-line { flex: 1; height: 1px; background: rgba(51,65,85,0.3); }
    .yr-lp { font-size: 9.5px; font-weight: 800; letter-spacing: 0.8px; color: #a78bfa; }
    .aw-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .aw {
        display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px;
        background: rgba(15,23,42,0.45); border: 1px solid rgba(51,65,85,0.24); border-left: 2px solid var(--k);
    }
    .aw-ico { font-size: 16px; line-height: 1; flex-shrink: 0; }
    .aw-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .aw-n { font-size: 12px; font-weight: 700; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .aw-m { font-size: 10px; font-weight: 600; color: var(--k); opacity: 0.85; }
    .aw-lp { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 800; color: #4a5b76; flex-shrink: 0; }

    /* ---------- MILESTONES ---------- */
    .ms-bar { height: 4px; border-radius: 3px; background: rgba(148,163,184,0.1); overflow: hidden; margin-bottom: 12px; }
    .ms-bar-fill { height: 100%; border-radius: 3px; background: #a78bfa; transition: width 0.4s ease; }
    .filters { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
    .fbtn {
        padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(51,65,85,0.32);
        background: rgba(15,23,42,0.5); font-family: inherit; font-size: 10.5px; font-weight: 700;
        color: #64748b; cursor: pointer;
    }
    .fbtn:hover { color: #cbd5e1; border-color: rgba(71,85,105,0.6); }
    .fbtn-on { color: #c4b5fd; background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.3); }

    .ms-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .ms {
        display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px;
        background: rgba(15,23,42,0.4); border: 1px solid rgba(51,65,85,0.22);
    }
    .ms-done { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.24); }
    .ms-ico { font-size: 15px; line-height: 1; flex-shrink: 0; opacity: 0.9; }
    .ms-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .ms-n { font-size: 11.5px; font-weight: 700; color: #cbd5e1; }
    .ms-done .ms-n { color: #86efac; }
    .ms-d { font-size: 10px; font-weight: 600; color: #46587a; line-height: 1.45; }
    .ms-rw {
        display: flex; align-items: center; gap: 6px; flex-shrink: 0;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 800;
    }
    .ms-gold { color: #eab308; }
    .ms-leg { color: #a78bfa; }
    .ms-tick { color: #22c55e; font-family: inherit; font-size: 9.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; }

    /* ---------- TABLE ---------- */
    .tbl-wrap { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
    .tbl { width: 100%; border-collapse: collapse; min-width: 620px; }
    .tbl th {
        text-align: left; font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
        color: #334155; padding: 0 12px 8px 0; white-space: nowrap;
    }
    .tbl td {
        padding: 10px 12px 10px 0; font-size: 12px; font-weight: 600; color: #94a3b8;
        border-top: 1px solid rgba(51,65,85,0.2); vertical-align: middle;
    }
    .td-y, .td-mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 800; color: #cbd5e1; white-space: nowrap; }
    .td-team { font-weight: 700; white-space: nowrap; }
    .td-none { color: #334155; }
    .td-aw { display: flex; flex-wrap: wrap; gap: 5px; }
    .td-chip {
        display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: 6px;
        font-size: 10px; font-weight: 700; color: var(--k); white-space: nowrap;
        background: color-mix(in srgb, var(--k) 11%, transparent);
        border: 1px solid color-mix(in srgb, var(--k) 26%, transparent);
    }

    /* ---------- EMPTY ---------- */
    .empty {
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;
        padding: 28px 16px; border-radius: 14px;
        background: rgba(15,23,42,0.35); border: 1px dashed rgba(51,65,85,0.4);
    }
    .empty-sm { padding: 18px 14px; }
    .empty-ico { font-size: 24px; opacity: 0.45; }
    .empty-t { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 700; color: #cbd5e1; margin: 0; }
    .empty-p { font-size: 11.5px; line-height: 1.6; color: #4a5b76; margin: 0; max-width: 460px; }

    /* ---------- RETIREMENT ---------- */
    .retire-open { border-color: rgba(239,68,68,0.24); }
    .ret-in { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; justify-content: space-between; }
    .ret-txt { min-width: 0; flex: 1; }
    .ret-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #e2e8f0; margin: 0 0 6px; }
    .ret-p { font-size: 11.5px; line-height: 1.65; color: #56688a; margin: 0; max-width: 640px; }
    .ret-act { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .ret-btn {
        padding: 11px 26px; border-radius: 12px; border: 1px solid rgba(239,68,68,0.4);
        background: linear-gradient(135deg, rgba(220,38,38,0.9) 0%, rgba(239,68,68,0.9) 100%);
        color: #fff; font-family: inherit; font-size: 12px; font-weight: 900; letter-spacing: 1px;
        text-transform: uppercase; cursor: pointer; white-space: nowrap;
    }
    .ret-btn:hover { box-shadow: 0 6px 20px rgba(239,68,68,0.28); }
    .ret-btn-off { background: rgba(15,23,42,0.6); border-color: rgba(51,65,85,0.4); color: #475569; cursor: not-allowed; }
    .ret-btn-off:hover { box-shadow: none; }
    .ret-note { font-size: 10px; font-weight: 600; color: #3f5069; }

    /* ---------- RESPONSIVE ---------- */
    @media (max-width: 1180px) {
        .hero { grid-template-columns: auto minmax(0, 1fr); }
        .hero-num { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; }
        .num { flex: 1 1 150px; }
        .split, .split-even { grid-template-columns: minmax(0, 1fr); }
        .room { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 720px) {
        .hero { grid-template-columns: minmax(0, 1fr); gap: 18px; padding: 18px; }
        .hero-card { align-self: center; }
        .hero-num { flex-direction: column; }
        .num { flex: 1 1 auto; }
        .id-name { font-size: 24px; }
        .num-big .num-v { font-size: 34px; }
        .lg-score { font-size: 34px; }
        .dev-note { margin-left: 0; max-width: none; }
        .pad { padding: 16px; }
        .ret-in { flex-direction: column; align-items: stretch; }
        .ret-act { align-items: stretch; }
        .ret-btn { width: 100%; }
        .ret-note { text-align: center; }
    }
    @media (max-width: 400px) {
        .id-grid { grid-template-columns: minmax(0, 1fr); }
        .tiles { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
    }
</style>
