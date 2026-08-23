<script>
    // =====================================================================
    //  LoL ULTIMATE CAREER -- CLUB
    // =====================================================================
    //  Two completely different screens behind one nav tab.
    //
    //  Unsigned, this is a scouting report: how far off the ladder gate you
    //  are, who is watching, and what actually has to happen before a club
    //  writes your name down. That state lasts years on the pre-competitive
    //  path, so it is built as a real screen rather than an error message.
    //
    //  Signed, it is the room you walk into: the org, your standing inside
    //  it, the four people either side of you, the table, the rival and the
    //  facilities you train in. Nothing here mutates the career -- every
    //  value is read from the store or derived by a career module.

    import Card from '../card/Card.svelte';
    import {
        career, careerScreen, careerOVR, currentTeam, soloRank,
    } from '../../stores/career.js';
    import { playSound } from '../../utils/sound.js';
    import {
        CLUB_TIERS, CLUB_TRAINING_SLOTS, REGION_BY_ID, ROLE_BY_ID,
        UNSIGNED_SOFT_CAP,
    } from '../../career/constants.js';
    import {
        statusInfo, toCareerCard, fmtGold, SCOUT_MMR_GATE,
    } from '../../career/ratings.js';
    import {
        ROSTER_SLOTS, describeTeam, teamStrength, teammatesOf, leagueTable, rivalFor,
    } from '../../career/teams.js';
    import {
        contractStatusLine, contractYearsLeft, clubReview, promotionEligible,
        interestedTeams,
    } from '../../career/contracts.js';

    // Mirrors MIN_OFFER_INTEREST in contracts.js, which is module-private.
    // Only used to caption the scouting board -- never to gate anything.
    const CALL_THRESHOLD = 35;

    // Forty competitive weeks a year, from the calendar in constants.js.
    const WEEKS_A_YEAR = 40;

    const VERDICTS = {
        untouchable: { label: 'Untouchable',  color: '#eab308' },
        happy:       { label: 'Happy',        color: '#22c55e' },
        watching:    { label: 'Watching',     color: '#3b82f6' },
        concerned:   { label: 'Concerned',    color: '#f59e0b' },
        cutting:     { label: 'Moving you on', color: '#ef4444' },
    };

    const FACILITY_BLURB = {
        1: 'A dedicated team house: analysts on every VOD, a performance coach who owns your sleep schedule, and scrim partners who are actually good.',
        2: 'A shared academy floor. Real coaching, borrowed scrim blocks, and a queue for the good chairs.',
        3: 'A Discord call and somebody\u{2019}s spare bedroom. It is still a club, a coach and a schedule, which is the whole point.',
    };

    function regionInfo(id) {
        const r = REGION_BY_ID[id];
        if (r) return { flag: r.flag, league: r.league, name: r.name };
        return { flag: '\u{1F310}', league: 'Open Circuit', name: 'Amateur' };
    }

    function pct(v, max) {
        const n = Number(v) || 0;
        const m = Number(max) || 1;
        return Math.max(0, Math.min(100, (n / m) * 100));
    }

    function chemistryBand(v) {
        if (v >= 85) return { name: 'Family', color: '#eab308', note: 'The room plays for you. Calls land before you finish making them.' };
        if (v >= 68) return { name: 'Trusted', color: '#22c55e', note: 'They listen. Scrims run smoothly and the coach backs your reads.' };
        if (v >= 50) return { name: 'Settled', color: '#3b82f6', note: 'Professional, functional, nobody is close to anybody. Normal.' };
        if (v >= 32) return { name: 'Unsettled', color: '#f59e0b', note: 'Comms are short and the debriefs are shorter. Win something.' };
        return { name: 'Fractured', color: '#ef4444', note: 'The room has stopped pretending. This does not survive a bad split.' };
    }

    function interestBand(v) {
        if (v >= 80) return { name: 'Chasing you', color: '#22c55e' };
        if (v >= 60) return { name: 'Watching closely', color: '#4ade80' };
        if (v >= CALL_THRESHOLD) return { name: 'Interested', color: '#3b82f6' };
        if (v >= 18) return { name: 'Curious', color: '#f59e0b' };
        return { name: 'Aware of you', color: '#64748b' };
    }

    function headToHead(state, other) {
        const out = { played: 0, w: 0, l: 0, next: null };
        if (!other) return out;
        const sched = Array.isArray(state && state.season && state.season.schedule)
            ? state.season.schedule : [];
        for (const f of sched) {
            if (!f || f.opponentId !== other.id) continue;
            if (f.played) {
                out.played += 1;
                if (f.won) out.w += 1; else out.l += 1;
            } else if (!out.next || f.week < out.next.week) {
                out.next = f;
            }
        }
        return out;
    }

    function multLabel(m) {
        const delta = Math.round((Number(m) - 1) * 100);
        if (delta > 0) return 'Every session here is worth ' + delta + '% more than training alone.';
        if (delta < 0) return 'Every session here is worth ' + Math.abs(delta) + '% less than a professional facility.';
        return 'Sessions here are worth exactly what you put into them.';
    }

    function goTransfers() {
        playSound('click');
        careerScreen.set('transfers');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    // -- shared --------------------------------------------------------
    $: c = $career;
    $: p = c.player;
    $: year = c.time.year;
    $: team = $currentTeam;
    $: signed = !!p.clubId && !!team;
    $: contractLine = contractStatusLine(c);

    // -- signed --------------------------------------------------------
    $: tierInfo = team ? (CLUB_TIERS[team.tier] || CLUB_TIERS[1]) : CLUB_TIERS[1];
    $: reg = regionInfo(team ? team.region : p.region);
    $: strength = team ? teamStrength(team, year) : 0;
    $: blurb = team ? describeTeam(team) : '';
    $: gap = $careerOVR - strength;

    $: status = statusInfo(p.status);
    $: chem = Math.round(Math.max(0, Math.min(100, p.chemistry == null ? 50 : p.chemistry)));
    $: chemBand = chemistryBand(chem);
    $: yearsLeft = contractYearsLeft(c);
    $: wage = p.contract ? (Number(p.contract.salary) || 0) : 0;
    $: clause = p.contract ? (Number(p.contract.releaseClause) || 0) : 0;
    $: review = signed ? clubReview(c) : null;
    $: verdict = review ? (VERDICTS[review.verdict] || VERDICTS.watching) : null;
    $: promo = signed ? promotionEligible(c) : { ok: false, team: null, reason: '' };

    $: myRole = ROLE_BY_ID[p.role] ? p.role : 'MID';
    $: mates = signed ? teammatesOf(c) : { starters: [], coach: null, all: [] };
    $: myCard = toCareerCard(p, team ? team.name : 'Free Agent', year);
    $: five = ROSTER_SLOTS.map(slot => (slot === myRole
        ? { slot, card: myCard, me: true }
        : { slot, card: mates.starters.find(x => x && x.role === slot) || null, me: false }));

    $: table = signed ? leagueTable(c) : [];
    $: showCut = table.length > 6;
    $: rival = signed ? rivalFor(c) : null;
    $: rivalReg = rival ? regionInfo(rival.region) : null;
    $: rivalStrength = rival ? teamStrength(rival, year) : 0;
    $: h2h = headToHead(c, rival);

    $: slots = team ? (CLUB_TRAINING_SLOTS[team.tier] || 0) : 0;
    $: slotsLeft = Math.max(0, Math.round(c.weekly.clubSlotsLeft || 0));
    $: facilityBlurb = FACILITY_BLURB[team ? team.tier : 3] || FACILITY_BLURB[3];

    // -- unsigned ------------------------------------------------------
    $: mmr = Math.max(0, Math.round((c.soloq && c.soloq.mmr) || 0));
    $: peak = Math.max(mmr, Math.round((c.soloq && c.soloq.peakMMR) || 0));
    $: gatePct = pct(mmr, SCOUT_MMR_GATE);
    $: scoutReady = mmr >= SCOUT_MMR_GATE;
    $: soloGames = Math.max(0, Math.round((c.soloq && c.soloq.games) || 0));
    $: soloWins = Math.max(0, Math.round((c.soloq && c.soloq.wins) || 0));
    $: soloRate = soloGames > 0 ? Math.round((soloWins / soloGames) * 100) : 0;
    $: watchers = signed ? [] : interestedTeams(c, 6);
</script>

<section class="club">
{#if !signed}
    <!-- ============================ UNSIGNED ============================ -->
    <div class="hero">
        <div class="hero-head">
            <span class="lbl">Club</span>
            <span class="chip chip-free">{c.flags.everSigned ? 'Free agent' : 'Unsigned'}</span>
        </div>
        <h2 class="hero-h">No club</h2>
        <p class="hero-line">{contractLine}</p>
        <p class="hero-p">
            Nobody pays you, nobody schedules you, and nobody is going to develop you.
            What you do have is time and a ladder, and every academy in the world reads
            that ladder. Three things have to be true before a contract turns up.
        </p>

        <ol class="steps">
            <li>
                <span class="step-n">1</span>
                <div>
                    <span class="step-h">Get to Diamond</span>
                    <span class="step-t">Scouts start returning calls at {SCOUT_MMR_GATE} MMR. Below that you are a name in a spreadsheet nobody opened.</span>
                </div>
            </li>
            <li>
                <span class="step-n">2</span>
                <div>
                    <span class="step-h">Keep training anyway</span>
                    <span class="step-t">Unsigned, every attribute chokes at {UNSIGNED_SOFT_CAP}. A club environment is the only thing that lifts that cap, so train right up to it and stop wasting weeks.</span>
                </div>
            </li>
            <li>
                <span class="step-n">3</span>
                <div>
                    <span class="step-h">Take the first real offer</span>
                    <span class="step-t">Even an open-circuit side gives you a coach, a room and a schedule. The cap comes off the day you sign, not the day you sign somewhere good.</span>
                </div>
            </li>
        </ol>

        <button class="btn-primary go" on:click={goTransfers}>Open the transfer desk</button>
    </div>

    <div class="two">
        <!-- Ladder gate -->
        <div class="pnl">
            <span class="lbl">Scouting gate</span>
            <div class="rank-row">
                <div class="rank-big" style="color:{$soloRank.color}">{$soloRank.label}</div>
                <div class="rank-mmr"><b>{mmr}</b><span>/ {SCOUT_MMR_GATE} MMR</span></div>
            </div>

            <div
                class="bar bar-lg"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax={SCOUT_MMR_GATE}
                aria-valuenow={Math.min(mmr, SCOUT_MMR_GATE)}
                aria-label="Progress toward the scouting gate"
            >
                <div class="bar-f" style="width:{gatePct}%; background:{scoutReady ? '#22c55e' : $soloRank.color}"></div>
                <span class="bar-gate" aria-hidden="true"></span>
            </div>

            <p class="gate-note" class:gate-on={scoutReady}>
                {#if scoutReady}
                    You are past the gate. Academies recruit off the ladder year-round, so an
                    offer can land in any week of the calendar &#x2014; not just the window.
                {:else}
                    {SCOUT_MMR_GATE - mmr} MMR to go. Solo queue is nearly all a scout has on you.
                {/if}
            </p>

            <div class="mini-stats">
                <div class="ms"><span class="ms-v">{peak}</span><span class="ms-l">Peak MMR</span></div>
                <div class="ms"><span class="ms-v">{soloGames}</span><span class="ms-l">Ranked games</span></div>
                <div class="ms"><span class="ms-v">{soloRate}%</span><span class="ms-l">Win rate</span></div>
            </div>
        </div>

        <!-- Scouting board -->
        <div class="pnl">
            <span class="lbl">Who is watching</span>
            {#if watchers.length === 0}
                <div class="empty">
                    <div class="empty-h">Not one scout has your name</div>
                    <p class="empty-p">
                        Interest is a number clubs recalculate every week from your rating, your
                        ladder position and your age. Train, climb, and this board fills itself in.
                    </p>
                </div>
            {:else}
                <ul class="board">
                    {#each watchers as row (row.team.id)}
                        {@const band = interestBand(row.interest)}
                        {@const t = CLUB_TIERS[row.team.tier] || CLUB_TIERS[1]}
                        {@const r = regionInfo(row.team.region)}
                        <li class="brow" style="--acc:{row.team.accent}">
                            <span class="brow-dot" aria-hidden="true"></span>
                            <div class="brow-id">
                                <span class="brow-name">{row.team.name}</span>
                                <span class="brow-sub">
                                    <span class="flag" aria-hidden="true">{r.flag}</span>
                                    {r.league}
                                    <span class="dot">&#183;</span>
                                    <span class="tiny-chip" style="--tc:{t.accent}">{t.name}</span>
                                </span>
                            </div>
                            <div class="brow-meter">
                                <div
                                    class="bar"
                                    role="progressbar"
                                    aria-valuemin="0"
                                    aria-valuemax="100"
                                    aria-valuenow={row.interest}
                                    aria-label="{row.team.name} interest"
                                >
                                    <div class="bar-f" style="width:{row.interest}%; background:{band.color}"></div>
                                </div>
                                <span class="brow-band" style="color:{band.color}">{band.name}</span>
                            </div>
                            <span class="brow-n">{row.interest}</span>
                        </li>
                    {/each}
                </ul>
                <p class="board-note">
                    A club has to clear {CALL_THRESHOLD} before it picks up the phone. Everything
                    below that is somebody in an office knowing your name.
                </p>
            {/if}
        </div>
    </div>

{:else}
    <!-- ============================= SIGNED ============================= -->
    <div class="chead" style="--acc:{team.accent}">
        <div class="chead-l">
            <span class="lbl">Your club</span>
            <h2 class="chead-name">{team.name}</h2>
            <div class="chead-meta">
                <span class="flag" aria-hidden="true">{reg.flag}</span>
                <span>{reg.league}</span>
                <span class="dot">&#183;</span>
                <span class="chip" style="--tc:{tierInfo.accent}">{tierInfo.name}</span>
            </div>
            <p class="chead-blurb">{blurb}</p>
        </div>
        <div class="chead-r">
            <div class="bignum">{strength}</div>
            <div class="bignum-l">Club strength</div>
            <div class="gapline" class:gap-up={gap >= 0}>
                {#if gap >= 0}
                    You rate {gap} above the roster line
                {:else}
                    You rate {Math.abs(gap)} below the roster line
                {/if}
            </div>
        </div>
    </div>

    <div class="two two-wide">
        <!-- Standing -->
        <div class="pnl">
            <span class="lbl">Your standing</span>

            <div class="stand-grid">
                <div class="cell">
                    <span class="cell-l">Squad status</span>
                    <span class="cell-v" style="color:{status.accent}">{status.name}</span>
                    <span class="cell-s">Starts about {Math.round(status.playChance * 100)}% of games</span>
                </div>
                <div class="cell">
                    <span class="cell-l">Weekly wage</span>
                    <span class="cell-v mono">{wage > 0 ? fmtGold(wage) : '\u{2014}'}</span>
                    <span class="cell-s">{wage > 0 ? fmtGold(wage * WEEKS_A_YEAR) + ' across a season' : 'No wage on this deal'}</span>
                </div>
                <div class="cell">
                    <span class="cell-l">Contract</span>
                    <span class="cell-v">
                        {#if yearsLeft <= 0}Final year{:else if yearsLeft === 1}1 year left{:else}{yearsLeft} years left{/if}
                    </span>
                    <span class="cell-s">
                        {#if clause > 0}Release clause {fmtGold(clause)}{:else}No release clause{/if}
                    </span>
                </div>
                <div class="cell">
                    <span class="cell-l">Chemistry</span>
                    <span class="cell-v" style="color:{chemBand.color}">{chemBand.name}</span>
                    <div
                        class="bar"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={chem}
                        aria-label="Chemistry with the roster"
                    >
                        <div class="bar-f" style="width:{chem}%; background:{chemBand.color}"></div>
                    </div>
                    <span class="cell-s">{chemBand.note}</span>
                </div>
            </div>

            <p class="contract-line">{contractLine}</p>

            {#if verdict}
                <div class="verdict" style="--vc:{verdict.color}">
                    <div class="verdict-top">
                        <span class="verdict-lbl">Coach&#x2019;s verdict</span>
                        <span class="verdict-tag">{verdict.label}</span>
                    </div>
                    <p class="verdict-t">{review.text}</p>
                </div>
            {/if}
        </div>

        <!-- Facilities -->
        <div class="pnl">
            <span class="lbl">Facilities</span>
            <div class="fac-head">
                <span class="fac-tier" style="color:{tierInfo.accent}">{tierInfo.name}</span>
                <span class="fac-sub">{reg.league} &#183; {reg.name}</span>
            </div>
            <p class="fac-blurb">{facilityBlurb}</p>

            <div class="fac-rows">
                <div class="fac-row">
                    <span class="fac-k">Coached sessions</span>
                    <span class="fac-v mono">{slots} <span class="fac-u">/ week</span></span>
                </div>
                <div class="fac-row">
                    <span class="fac-k">Left this week</span>
                    <span class="fac-v mono" style="color:{slotsLeft > 0 ? '#a78bfa' : '#475569'}">{slotsLeft}</span>
                </div>
                <div class="fac-row">
                    <span class="fac-k">Session quality</span>
                    <span class="fac-v mono">&#xD7;{tierInfo.trainingMult.toFixed(2)}</span>
                </div>
            </div>

            <p class="fac-note">{multLabel(tierInfo.trainingMult)}</p>
        </div>
    </div>

    {#if promo.ok}
        <div class="promo">
            <span class="promo-ico" aria-hidden="true">&#x2B06;</span>
            <div class="promo-body">
                <span class="promo-h">{promo.team.name} are watching the academy floor</span>
                <p class="promo-t">
                    {promo.reason} The main roster reviews the call at the end of the split
                    &#x2014; keep the ratings where they are and you go up without a transfer.
                </p>
            </div>
        </div>
    {:else if team.tier === 2 && promo.reason}
        <div class="promo promo-off">
            <span class="promo-ico" aria-hidden="true">&#x2B06;</span>
            <div class="promo-body">
                <span class="promo-h">Promotion to the main roster</span>
                <p class="promo-t">{promo.reason}</p>
            </div>
        </div>
    {/if}

    <!-- Roster -->
    <div class="pnl">
        <span class="lbl">Starting five &#183; {year}</span>
        <div class="roster">
            <div class="five">
                {#each five as seat (seat.slot)}
                    {@const role = ROLE_BY_ID[seat.slot]}
                    <div class="seat" class:seat-me={seat.me}>
                        <div class="seat-top">
                            <span class="seat-role" style="--rc:{role ? role.accent : '#64748b'}">
                                {role ? role.short : seat.slot}
                            </span>
                            {#if seat.me}<span class="seat-you">You</span>{/if}
                        </div>
                        {#if seat.card}
                            <Card card={seat.card} mini={true} />
                        {:else}
                            <div class="seat-empty">
                                <span class="seat-empty-r">{seat.slot}</span>
                                <span class="seat-empty-t">Seat unfilled</span>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <div class="staff">
                <span class="lbl staff-lbl">Coaching staff</span>
                {#if mates.coach}
                    <Card card={mates.coach} mini={true} />
                    <p class="staff-note">
                        A coach is judged against the club, not an absolute bar &#x2014; staff
                        better than the org deserves is worth real strength on stage.
                    </p>
                {:else}
                    <div class="seat-empty">
                        <span class="seat-empty-r">Coach</span>
                        <span class="seat-empty-t">No staff listed</span>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="two two-table">
        <!-- League table -->
        <div class="pnl">
            <span class="lbl">{reg.league} table &#183; {c.season.split === 'summer' ? 'Summer' : 'Spring'} split</span>
            {#if table.length === 0}
                <div class="empty">
                    <div class="empty-h">No division to stand in yet</div>
                    <p class="empty-p">The table appears once the split is drawn and the first fixtures are on the calendar.</p>
                </div>
            {:else}
                <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                <div class="tbl-wrap" tabindex="0" role="region" aria-label="League table">
                    <table class="tbl">
                        <thead>
                            <tr>
                                <th scope="col" class="c-rank">#</th>
                                <th scope="col">Team</th>
                                <th scope="col" class="c-num">W</th>
                                <th scope="col" class="c-num">L</th>
                                <th scope="col" class="c-rate">Win rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each table as row (row.team.id)}
                                {@const played = row.w + row.l}
                                {@const rate = played ? Math.round((row.w / played) * 100) : 0}
                                <tr
                                    class:me={row.isMine}
                                    class:cutline={showCut && row.rank === 6}
                                    style="--acc:{row.team.accent}"
                                >
                                    <td class="c-rank mono">{row.rank}</td>
                                    <td class="c-team">
                                        <span class="t-dot" aria-hidden="true"></span>
                                        <span class="t-name">{row.team.name}</span>
                                        {#if row.isMine}<span class="t-you">You</span>{/if}
                                    </td>
                                    <td class="c-num mono">{row.w}</td>
                                    <td class="c-num mono">{row.l}</td>
                                    <td class="c-rate">
                                        <div class="rate">
                                            <div class="bar bar-sm">
                                                <div class="bar-f" style="width:{played ? rate : 0}%"></div>
                                            </div>
                                            <span class="rate-n mono">{played ? rate + '%' : '\u{2014}'}</span>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                {#if showCut}
                    <p class="tbl-note">The line under sixth is the playoff cut.</p>
                {/if}
            {/if}
        </div>

        <!-- Rival -->
        <div class="pnl">
            <span class="lbl">Rival</span>
            {#if !rival}
                <div class="empty">
                    <div class="empty-h">No rival yet</div>
                    <p class="empty-p">A rivalry needs a division. Once the split is drawn, the club closest to yours in strength becomes the season&#x2019;s measuring stick.</p>
                </div>
            {:else}
                <div class="rival" style="--acc:{rival.accent}">
                    <div class="rival-head">
                        <span class="rival-dot" aria-hidden="true"></span>
                        <div>
                            <div class="rival-name">{rival.name}</div>
                            <div class="rival-sub">
                                <span class="flag" aria-hidden="true">{rivalReg.flag}</span>
                                {rivalReg.league}
                                <span class="dot">&#183;</span>
                                strength {rivalStrength}
                            </div>
                        </div>
                    </div>

                    <div class="h2h">
                        <div class="h2h-cell">
                            <span class="h2h-v" style="color:#22c55e">{h2h.w}</span>
                            <span class="h2h-l">Won</span>
                        </div>
                        <div class="h2h-cell">
                            <span class="h2h-v" style="color:#ef4444">{h2h.l}</span>
                            <span class="h2h-l">Lost</span>
                        </div>
                        <div class="h2h-cell">
                            <span class="h2h-v">{h2h.next ? 'W' + h2h.next.week : '\u{2014}'}</span>
                            <span class="h2h-l">Next meeting</span>
                        </div>
                    </div>

                    <p class="rival-note">
                        {#if h2h.played === 0 && h2h.next}
                            You have not played them yet this split. The head-to-head starts in week {h2h.next.week}.
                        {:else if h2h.played === 0}
                            Nothing on the calendar against them this split. The rivalry is on paper for now.
                        {:else if h2h.w > h2h.l}
                            You are ahead of them this split, and they know exactly what the return fixture is worth.
                        {:else if h2h.l > h2h.w}
                            They have your number this split. Everything else in the table is noise until that changes.
                        {:else}
                            Level this split. Whoever takes the next one takes the season&#x2019;s argument with it.
                        {/if}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}
</section>

<style>
    .club {
        max-width: 1460px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    /* ---------- shared primitives ---------- */
    .lbl {
        display: block;
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #3f5069;
        margin-bottom: 12px;
    }
    .pnl {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 18px;
        padding: 18px 20px 20px;
        min-width: 0;
    }
    .mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    .dot { color: #2c3a52; margin: 0 2px; }
    .flag { font-size: 12px; line-height: 1; }

    .chip {
        display: inline-block;
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 6px;
        color: var(--tc, #94a3b8);
        background: color-mix(in srgb, var(--tc, #94a3b8) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--tc, #94a3b8) 30%, transparent);
    }
    .chip-free {
        --tc: #a78bfa;
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.12);
        border-color: rgba(139, 92, 246, 0.28);
    }
    .tiny-chip {
        font-size: 8px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 5px;
        color: var(--tc, #94a3b8);
        border: 1px solid color-mix(in srgb, var(--tc, #94a3b8) 30%, transparent);
    }

    .bar {
        position: relative;
        height: 5px;
        border-radius: 4px;
        background: rgba(148, 163, 184, 0.12);
        overflow: hidden;
    }
    .bar-lg { height: 9px; border-radius: 6px; overflow: visible; }
    .bar-sm { height: 4px; }
    .bar-f {
        height: 100%;
        border-radius: 4px;
        background: #a78bfa;
        transition: width 0.35s ease;
    }
    .bar-lg .bar-f { border-radius: 6px; }
    .bar-gate {
        position: absolute;
        right: 0; top: -3px;
        width: 2px; height: 15px;
        border-radius: 2px;
        background: rgba(148, 163, 184, 0.5);
    }

    .two {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        align-items: start;
    }
    .two-wide { grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); }
    .two-table { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }

    .empty {
        border: 1px dashed rgba(51, 65, 85, 0.35);
        border-radius: 14px;
        padding: 22px 18px;
        text-align: center;
    }
    .empty-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 14px; font-weight: 700; color: #94a3b8;
        margin-bottom: 6px;
    }
    .empty-p { font-size: 11.5px; line-height: 1.65; color: #56688a; margin: 0 auto; max-width: 380px; }

    /* ---------- unsigned hero ---------- */
    .hero {
        background:
            radial-gradient(120% 140% at 0% 0%, rgba(139, 92, 246, 0.10) 0%, rgba(139, 92, 246, 0) 58%),
            rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(139, 92, 246, 0.22);
        border-radius: 20px;
        padding: 22px 24px 24px;
    }
    .hero-head { display: flex; align-items: center; gap: 12px; }
    .hero-head .lbl { margin-bottom: 0; }
    .hero-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 30px; font-weight: 700; letter-spacing: -0.02em;
        color: #e8eefb;
        margin: 12px 0 6px;
    }
    .hero-line { font-size: 12.5px; font-weight: 600; color: #a78bfa; margin-bottom: 12px; }
    .hero-p { font-size: 13px; line-height: 1.7; color: #7e8ea9; max-width: 720px; }

    .steps { list-style: none; margin: 18px 0 20px; padding: 0; display: grid; gap: 12px; }
    .steps li { display: flex; gap: 12px; align-items: flex-start; }
    .step-n {
        flex-shrink: 0;
        width: 22px; height: 22px;
        display: grid; place-items: center;
        border-radius: 7px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800;
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.12);
        border: 1px solid rgba(139, 92, 246, 0.28);
    }
    .step-h { display: block; font-size: 12.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 3px; }
    .step-t { display: block; font-size: 12px; line-height: 1.6; color: #64748b; max-width: 640px; }
    .go { width: auto; }

    /* ---------- scouting gate ---------- */
    .rank-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
    .rank-big {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 20px; font-weight: 700; letter-spacing: -0.01em;
    }
    .rank-mmr { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; color: #475569; }
    .rank-mmr b { font-size: 14px; font-weight: 800; color: #cbd5e1; margin-right: 5px; }

    .gate-note { font-size: 11.5px; line-height: 1.65; color: #64748b; margin-top: 12px; }
    .gate-on { color: #4ade80; }

    .mini-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 16px;
    }
    .ms {
        background: rgba(15, 23, 42, 0.42);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 12px;
        padding: 10px 8px;
        text-align: center;
    }
    .ms-v {
        display: block;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 15px; font-weight: 800; color: #cbd5e1;
    }
    .ms-l { display: block; font-size: 8px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #475569; margin-top: 3px; }

    /* ---------- scouting board ---------- */
    .board { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .brow {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) minmax(96px, 130px) 30px;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.42);
        border: 1px solid rgba(51, 65, 85, 0.2);
    }
    .brow-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--acc); }
    .brow-id { min-width: 0; }
    .brow-name {
        display: block;
        font-size: 12.5px; font-weight: 700; color: #dbe4f4;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .brow-sub { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 600; color: #56688a; margin-top: 3px; }
    .brow-meter { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .brow-band { font-size: 9px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; }
    .brow-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 13px; font-weight: 800; color: #94a3b8; text-align: right;
    }
    .board-note { font-size: 11px; line-height: 1.6; color: #4a5b76; margin-top: 12px; }

    /* ---------- club header ---------- */
    .chead {
        display: flex;
        align-items: stretch;
        gap: 24px;
        padding: 22px 24px;
        border-radius: 20px;
        background:
            radial-gradient(110% 150% at 0% 0%, color-mix(in srgb, var(--acc) 16%, transparent) 0%, transparent 60%),
            rgba(12, 16, 28, 0.5);
        border: 1px solid color-mix(in srgb, var(--acc) 26%, rgba(51, 65, 85, 0.28));
    }
    .chead-l { flex: 1; min-width: 0; }
    .chead-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
        color: #e8eefb;
        margin-bottom: 8px;
        line-height: 1.1;
    }
    .chead-meta { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; color: #56688a; flex-wrap: wrap; }
    .chead-blurb { font-size: 12.5px; line-height: 1.7; color: #7e8ea9; margin-top: 12px; max-width: 640px; }

    .chead-r {
        flex-shrink: 0;
        width: 190px;
        display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
        text-align: right;
        padding-left: 20px;
        border-left: 1px solid rgba(51, 65, 85, 0.22);
    }
    .bignum {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 44px; font-weight: 700; line-height: 1;
        color: var(--acc);
    }
    .bignum-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #475569; margin-top: 5px; }
    .gapline { font-size: 10.5px; font-weight: 700; color: #f59e0b; margin-top: 10px; }
    .gap-up { color: #4ade80; }

    /* ---------- standing ---------- */
    .stand-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }
    .cell {
        background: rgba(15, 23, 42, 0.42);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 12px;
        padding: 12px 14px;
        min-width: 0;
    }
    .cell-l { display: block; font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }
    .cell-v {
        display: block;
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 17px; font-weight: 700; color: #e2e8f0;
        margin: 6px 0 4px;
    }
    .cell-s { display: block; font-size: 10.5px; line-height: 1.55; color: #56688a; margin-top: 6px; }
    .cell .bar { margin-top: 2px; }

    .contract-line {
        font-size: 11px; font-weight: 600; color: #64748b;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(51, 65, 85, 0.2);
    }

    .verdict {
        margin-top: 14px;
        padding: 14px 16px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--vc) 8%, rgba(15, 23, 42, 0.42));
        border: 1px solid color-mix(in srgb, var(--vc) 26%, transparent);
        border-left: 3px solid var(--vc);
    }
    .verdict-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
    .verdict-lbl { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }
    .verdict-tag {
        font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        color: var(--vc);
        padding: 3px 8px; border-radius: 6px;
        background: color-mix(in srgb, var(--vc) 12%, transparent);
    }
    .verdict-t { font-size: 12.5px; line-height: 1.7; color: #b6c3d8; }

    /* ---------- facilities ---------- */
    .fac-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .fac-tier { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; font-weight: 700; }
    .fac-sub { font-size: 10px; font-weight: 700; color: #475569; }
    .fac-blurb { font-size: 12px; line-height: 1.7; color: #7e8ea9; margin: 10px 0 14px; }
    .fac-rows { display: grid; gap: 6px; }
    .fac-row {
        display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
        padding: 9px 12px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.42);
        border: 1px solid rgba(51, 65, 85, 0.2);
    }
    .fac-k { font-size: 11px; font-weight: 600; color: #64748b; }
    .fac-v { font-size: 14px; font-weight: 800; color: #cbd5e1; }
    .fac-u { font-size: 9px; font-weight: 700; color: #475569; }
    .fac-note { font-size: 11px; line-height: 1.6; color: #4a5b76; margin-top: 12px; }

    /* ---------- promotion ---------- */
    .promo {
        display: flex; align-items: flex-start; gap: 14px;
        padding: 16px 20px;
        border-radius: 16px;
        background:
            radial-gradient(90% 160% at 0% 0%, rgba(234, 179, 8, 0.10) 0%, transparent 60%),
            rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(234, 179, 8, 0.28);
    }
    .promo-off {
        background: rgba(12, 16, 28, 0.5);
        border-color: rgba(51, 65, 85, 0.28);
    }
    .promo-ico { font-size: 17px; line-height: 1.2; }
    .promo-off .promo-ico { opacity: 0.4; }
    .promo-body { min-width: 0; }
    .promo-h {
        display: block;
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 15px; font-weight: 700; color: #fbbf24;
        margin-bottom: 5px;
    }
    .promo-off .promo-h { color: #94a3b8; }
    .promo-t { font-size: 12px; line-height: 1.7; color: #7e8ea9; max-width: 820px; }

    /* ---------- roster ---------- */
    .roster { display: flex; align-items: flex-start; gap: 22px; }
    .five { display: flex; flex-wrap: wrap; gap: 14px; flex: 1; min-width: 0; }
    .seat { display: flex; flex-direction: column; gap: 8px; width: 180px; }
    .seat-top { display: flex; align-items: center; gap: 6px; height: 18px; }
    .seat-role {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px;
        color: var(--rc);
        background: color-mix(in srgb, var(--rc) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--rc) 28%, transparent);
    }
    .seat-you {
        font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px;
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.3);
    }
    .seat-me { position: relative; }
    .seat-empty {
        width: 180px; height: 252px;
        border-radius: 14px;
        border: 2px dashed rgba(51, 65, 85, 0.28);
        background: rgba(12, 16, 28, 0.35);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    }
    .seat-empty-r { font-size: 12px; font-weight: 800; color: #334155; letter-spacing: 1px; }
    .seat-empty-t { font-size: 10px; color: #334155; }

    .staff {
        flex-shrink: 0;
        width: 214px;
        padding-left: 22px;
        border-left: 1px solid rgba(51, 65, 85, 0.22);
    }
    .staff-lbl { margin-bottom: 8px; }
    .staff-note { font-size: 10.5px; line-height: 1.6; color: #4a5b76; margin-top: 12px; }

    /* ---------- table ---------- */
    .tbl-wrap { overflow-x: auto; border-radius: 12px; }
    .tbl-wrap:focus-visible { outline: 2px solid rgba(139, 92, 246, 0.5); outline-offset: 2px; }
    .tbl { width: 100%; min-width: 460px; border-collapse: collapse; }
    .tbl th {
        text-align: left;
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        color: #3f5069;
        padding: 0 10px 9px;
        border-bottom: 1px solid rgba(51, 65, 85, 0.24);
        white-space: nowrap;
    }
    .tbl td { padding: 9px 10px; border-bottom: 1px solid rgba(51, 65, 85, 0.12); }
    .tbl tbody tr:last-child td { border-bottom: none; }
    .c-rank { width: 34px; font-size: 12px; font-weight: 800; color: #64748b; }
    .c-num { width: 40px; text-align: center; font-size: 12.5px; font-weight: 700; color: #cbd5e1; }
    .tbl th.c-num { text-align: center; }
    .c-rate { width: 132px; }
    .c-team { min-width: 0; }
    .t-dot {
        display: inline-block;
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--acc);
        margin-right: 8px;
        vertical-align: middle;
    }
    .t-name { font-size: 12.5px; font-weight: 600; color: #b6c3d8; vertical-align: middle; }
    .t-you {
        margin-left: 8px;
        font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 5px;
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.3);
        vertical-align: middle;
    }
    .tbl tr.me td { background: rgba(139, 92, 246, 0.10); }
    .tbl tr.me td:first-child { box-shadow: inset 3px 0 0 #a78bfa; }
    .tbl tr.me .t-name { color: #e8eefb; font-weight: 700; }
    .tbl tr.me .c-rank { color: #c4b5fd; }
    .tbl tr.cutline td { border-bottom: 1px solid rgba(139, 92, 246, 0.35); }
    .rate { display: flex; align-items: center; gap: 8px; }
    .rate .bar { flex: 1; min-width: 40px; }
    .rate-n { font-size: 11px; font-weight: 700; color: #64748b; width: 34px; text-align: right; }
    .tbl-note { font-size: 10.5px; color: #4a5b76; margin-top: 10px; }

    /* ---------- rival ---------- */
    .rival {
        border-radius: 14px;
        padding: 16px;
        background: color-mix(in srgb, var(--acc) 7%, rgba(15, 23, 42, 0.42));
        border: 1px solid color-mix(in srgb, var(--acc) 24%, transparent);
    }
    .rival-head { display: flex; align-items: center; gap: 10px; }
    .rival-dot { flex-shrink: 0; width: 10px; height: 10px; border-radius: 50%; background: var(--acc); }
    .rival-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 16px; font-weight: 700; color: #e8eefb;
    }
    .rival-sub { display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; color: #56688a; margin-top: 3px; }
    .h2h {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin: 14px 0 12px;
    }
    .h2h-cell {
        background: rgba(6, 9, 17, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 11px;
        padding: 10px 6px;
        text-align: center;
    }
    .h2h-v {
        display: block;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 17px; font-weight: 800; color: #cbd5e1;
    }
    .h2h-l { display: block; font-size: 8px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #475569; margin-top: 4px; }
    .rival-note { font-size: 11.5px; line-height: 1.65; color: #7e8ea9; }

    /* ---------- responsive ---------- */
    @media (max-width: 1180px) {
        .two-wide, .two-table { grid-template-columns: minmax(0, 1fr); }
        .roster { flex-direction: column; }
        .staff {
            width: 100%;
            padding-left: 0;
            padding-top: 18px;
            border-left: none;
            border-top: 1px solid rgba(51, 65, 85, 0.22);
            display: flex; flex-direction: column;
        }
        .staff-note { max-width: 420px; }
    }
    @media (max-width: 860px) {
        .two { grid-template-columns: minmax(0, 1fr); }
        .chead { flex-direction: column; gap: 18px; }
        .chead-r {
            width: 100%;
            flex-direction: row;
            align-items: baseline;
            justify-content: flex-start;
            gap: 12px;
            text-align: left;
            padding-left: 0;
            padding-top: 16px;
            border-left: none;
            border-top: 1px solid rgba(51, 65, 85, 0.22);
        }
        .bignum { font-size: 34px; }
        .bignum-l { margin-top: 0; }
        .gapline { margin-top: 0; margin-left: auto; }
        .five { justify-content: center; }
    }
    @media (max-width: 620px) {
        .club { gap: 14px; }
        .pnl, .hero { padding: 16px 14px 18px; border-radius: 16px; }
        .chead { padding: 18px 16px; border-radius: 16px; }
        .hero-h { font-size: 24px; }
        .chead-name { font-size: 22px; }
        .stand-grid { grid-template-columns: minmax(0, 1fr); }
        .brow { grid-template-columns: 8px minmax(0, 1fr) 30px; }
        .brow-meter { grid-column: 2 / 4; }
        .mini-stats { gap: 6px; }
        .go { width: 100%; }
    }
    @media (max-width: 420px) {
        .seat, .seat-empty { width: 100%; max-width: 220px; }
        .five { gap: 16px; }
    }
</style>
