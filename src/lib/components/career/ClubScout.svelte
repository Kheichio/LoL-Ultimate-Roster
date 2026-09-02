<script>
    // =====================================================================
    //  LoL ULTIMATE CAREER -- CLUB SCOUT
    // =====================================================================
    //  Any one of the 108 orgs in the mode, read the way the player's own club
    //  is read on the Club screen: the five seats, the coach, the league, the
    //  tier and the strength line.
    //
    //  teams.getTeamRoster() has always resolved every club in the database.
    //  Until this panel existed, nothing but the player's own club ever asked
    //  it -- every rival, every league-table row and every fixture opponent was
    //  an inert span.
    //
    //  IT IS A VIEW. There is no store write, no engine call and no mutator of
    //  any kind below. rosterForClub() hands back FRESH SHALLOW COPIES exactly
    //  so a panel like this can never reach the shared card-database instances
    //  that awards.js, match.js and teamStrength() are also holding.
    //
    //  IT DELIBERATELY SHOWS NO MOMENTUM, NO SCRIM AND NO FORM SWING for a
    //  foreign club. clubMomentum(), clubStrengthDelta() and teammateFormDelta()
    //  all read career.club, which is scoped by club.teamId to the club the
    //  player actually plays for, so they are zero everywhere else BY DESIGN.
    //  Printing a hardcoded zero would be a lie, and widening the club block to
    //  fill them in would stop teamStrength() being a pure function of
    //  (team, year) -- which is the only thing keeping the league table stable
    //  between page loads.
    //
    //  ASCII only. Emoji and dashes are \u escapes or HTML entities.

    import Card from '../card/Card.svelte';
    import { career } from '../../stores/career.js';
    import {
        CLUB_TIERS, REGION_BY_ID, ROLE_BY_ID, teamById,
    } from '../../career/constants.js';
    import {
        ROSTER_SLOTS, rosterForClub, describeTeam, teamStrength,
    } from '../../career/teams.js';
    import { boardDBReady } from '../../career/board.js';

    /** The club to scout. An id nothing resolves renders the "no such club"
     *  empty state rather than throwing -- the caller may be handing over a
     *  bracket slot that has not been drawn yet. */
    export let teamId = null;
    /** The season the roster is derived for. Defaulted from the save when the
     *  caller passes nothing, because every seat is a derivation of
     *  (teamId, year) and a missing year would silently move the whole squad. */
    export let year = 0;
    /** Optional. When it is a function the panel draws its own close control. */
    export let onClose = null;

    /** Card.svelte falls back to the GLOBAL inspectingCard store when it is
     *  handed no click handler, and CardInspectModal is mounted at the App root
     *  OUTSIDE the career shell -- so an unhandled click really does open the
     *  other gamemode's inspector over career mode. Every <Card> below is
     *  handed this instead. */
    function noopCard() {}

    /** A club seat, or null when there is nothing renderable in it.
     *
     *  Card.svelte does `card.name.slice(0, 2)` and `card.quality.toLowerCase()`
     *  with NO guard. Junk renders as an unfilled seat rather than as an
     *  invented player: the data for that seat is gone, and inventing a name
     *  would be a lie. Copied from CareerDossier.svelte, which guards its own
     *  room panel the same way. */
    function seatCard(card) {
        if (!card || typeof card !== 'object') return null;
        if (typeof card.name !== 'string' || !card.name) return null;
        if (typeof card.quality !== 'string' || !card.quality) return null;
        if (!card.stats || typeof card.stats !== 'object') return null;
        return card;
    }

    function regionInfo(id) {
        const r = REGION_BY_ID[id];
        if (r) return { flag: r.flag, league: r.league, name: r.name };
        return { flag: '\u{1F310}', league: 'Open Circuit', name: 'Amateur' };
    }

    function close() {
        if (typeof onClose === 'function') onClose();
    }

    // -- reads, every one of them wrapped ---------------------------------
    $: c = $career || {};
    $: player = (c && c.player) || {};
    $: yr = (() => {
        const n = Number(year);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
        const fromSave = Number(c && c.time && c.time.year);
        return Number.isFinite(fromSave) && fromSave > 0 ? Math.round(fromSave) : 2026;
    })();

    $: team = (() => {
        try { return teamById(teamId) || null; } catch (e) { return null; }
    })();

    // Without the card database getTeamRoster() invents five synthetic names
    // and never visibly corrects itself, so a viewer would read fiction as
    // fact. Same gate CareerDossier's room panel runs.
    $: dbReady = (() => {
        try { return !!boardDBReady(); } catch (e) { return false; }
    })();

    $: mine = !!(team && player.clubId && player.clubId === team.id);
    $: tierInfo = team ? (CLUB_TIERS[team.tier] || CLUB_TIERS[3]) : CLUB_TIERS[3];
    $: reg = regionInfo(team ? team.region : null);
    $: accent = (team && typeof team.accent === 'string' && team.accent) ? team.accent : '#64748b';

    $: blurb = (() => {
        if (!team) return '';
        try { return describeTeam(team) || ''; } catch (e) { return ''; }
    })();

    $: strength = (() => {
        if (!team) return 0;
        try {
            const v = teamStrength(team, yr);
            return Number.isFinite(v) ? Math.round(v) : 50;
        } catch (e) { return 50; }
    })();

    // The GUARDED year, not the raw prop. rosterForClub() reads the field
    // through `Number(x) || DEFAULT`, which lets a non-finite year straight
    // through and stamps it onto every seat -- so the header would say 2029
    // and the five cards under it the literal word. Handing over the same year
    // the header prints keeps the panel internally honest.
    $: scoutCareer = { ...c, time: { ...((c && c.time) || {}), year: yr } };

    $: roster = (() => {
        if (!team || !dbReady) return {};
        try { return rosterForClub(scoutCareer, team.id) || {}; } catch (e) { return {}; }
    })();

    $: seats = ROSTER_SLOTS.map(slot => ({ slot, card: seatCard(roster[slot]) }));
    $: coach = seatCard(roster.COACH);
    $: filled = seats.filter(s => s.card).length;
</script>

<div class="cs">
    <div class="cs-head" style="--acc:{accent}">
        <div class="cs-id">
            <span class="cs-lbl">Scouting report</span>
            <h3 class="cs-name">{team ? team.name : 'Unknown club'}</h3>
            <div class="cs-meta">
                <span class="cs-flag" aria-hidden="true">{reg.flag}</span>
                <span>{reg.league}</span>
                <span class="cs-dot">&#183;</span>
                <span class="cs-chip" style="--tc:{tierInfo.accent}">{tierInfo.name}</span>
                {#if mine}
                    <span class="cs-chip cs-chip-mine">Your club</span>
                {/if}
            </div>
        </div>

        <div class="cs-num">
            <span class="cs-str">{strength}</span>
            <span class="cs-str-l">Club strength &#183; {yr}</span>
        </div>

        {#if typeof onClose === 'function'}
            <button class="cs-x" type="button" on:click={close} aria-label="Close the scouting report">
                &#215;
            </button>
        {/if}
    </div>

    {#if !team}
        <div class="cs-empty">
            <div class="cs-empty-h">No club to scout</div>
            <p class="cs-empty-p">
                Nothing in the database answers to that name. A bracket slot that has not
                been drawn yet has no roster behind it, which is most often what this is.
            </p>
        </div>
    {:else}
        {#if blurb}
            <p class="cs-blurb">{blurb}</p>
        {/if}

        {#if !dbReady}
            <!-- Without the card database getTeamRoster() invents five synthetic
                 names and never visibly corrects itself, so five strangers would
                 be presented as this club's starting five. Show nothing instead. -->
            <div class="cs-empty">
                <div class="cs-empty-h">Card database still loading</div>
                <p class="cs-empty-p">
                    Every roster in the mode is derived from the card database. Until it is
                    in memory this panel could only show five invented names, so it shows none.
                </p>
            </div>
        {:else}
            <span class="cs-lbl cs-lbl-in">Starting five &#183; {yr}</span>
            <div class="cs-roster">
                <div class="cs-five">
                    {#each seats as seat (seat.slot)}
                        {@const role = ROLE_BY_ID[seat.slot]}
                        <div class="cs-seat">
                            <div class="cs-seat-top">
                                <span class="cs-role" style="--rc:{role ? role.accent : '#64748b'}">
                                    {role ? role.short : seat.slot}
                                </span>
                            </div>
                            {#if seat.card}
                                <Card card={seat.card} mini={true} onclick={noopCard} />
                            {:else}
                                <div class="cs-gap">
                                    <span class="cs-gap-r">{seat.slot}</span>
                                    <span class="cs-gap-t">Seat unfilled</span>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>

                <div class="cs-staff">
                    <span class="cs-lbl cs-lbl-in">Coaching staff</span>
                    {#if coach}
                        <Card card={coach} mini={true} onclick={noopCard} />
                    {:else}
                        <div class="cs-gap">
                            <span class="cs-gap-r">Coach</span>
                            <span class="cs-gap-t">No staff listed</span>
                        </div>
                    {/if}
                </div>
            </div>

            <p class="cs-note">
                {#if mine}
                    Your own room, with the signings, the form swing and the scrims you have
                    banked already folded into every rating.
                {:else if filled === 0}
                    Nothing is on the books for {team.name} in {yr}. Every seat in the mode is
                    derived from the card database, and this one has nobody in it.
                {:else}
                    The squad as {yr} lists it. Momentum, form and scrim sharpening are club
                    state that only ever exists for the club you play for, so nothing here is
                    shifted off the written line &#8212; this is the roster the league table
                    is built from.
                {/if}
            </p>
        {/if}
    {/if}
</div>

<style>
    .cs {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
    }

    .cs-lbl {
        display: block;
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #3f5069;
    }
    .cs-lbl-in { margin-bottom: 10px; }
    .cs-dot { color: #2c3a52; margin: 0 2px; }
    .cs-flag { font-size: 12px; line-height: 1; }

    /* ---------- header ---------- */
    .cs-head {
        display: flex;
        align-items: flex-start;
        gap: 18px;
        padding: 16px 18px;
        border-radius: 16px;
        background:
            radial-gradient(110% 150% at 0% 0%, color-mix(in srgb, var(--acc) 16%, transparent) 0%, transparent 62%),
            rgba(12, 16, 28, 0.5);
        border: 1px solid color-mix(in srgb, var(--acc) 26%, rgba(51, 65, 85, 0.28));
    }
    .cs-id { flex: 1; min-width: 0; }
    .cs-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
        color: #e8eefb;
        margin: 8px 0 8px;
        line-height: 1.15;
    }
    .cs-meta {
        display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
        font-size: 11px; font-weight: 700; color: #56688a;
    }
    .cs-chip {
        display: inline-block;
        font-size: 8px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 5px;
        color: var(--tc, #94a3b8);
        border: 1px solid color-mix(in srgb, var(--tc, #94a3b8) 30%, transparent);
    }
    .cs-chip-mine {
        --tc: #a78bfa;
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.14);
        border-color: rgba(139, 92, 246, 0.3);
    }

    .cs-num {
        flex-shrink: 0;
        display: flex; flex-direction: column; align-items: flex-end;
        text-align: right;
        padding-left: 16px;
        border-left: 1px solid rgba(51, 65, 85, 0.22);
    }
    .cs-str {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 30px; font-weight: 700; line-height: 1;
        color: var(--acc);
    }
    .cs-str-l {
        font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        color: #475569; margin-top: 5px; white-space: nowrap;
    }

    .cs-x {
        flex-shrink: 0;
        width: 28px; height: 28px;
        display: grid; place-items: center;
        border-radius: 9px;
        font-size: 17px; line-height: 1; font-family: inherit;
        color: #7c8db0;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.35);
        cursor: pointer;
        transition: color 0.15s ease, border-color 0.15s ease;
    }
    .cs-x:hover { color: #e2e8f0; border-color: rgba(148, 163, 184, 0.5); }
    .cs-x:focus-visible { outline: 2px solid rgba(139, 92, 246, 0.55); outline-offset: 2px; }

    .cs-blurb { font-size: 12.5px; line-height: 1.7; color: #7e8ea9; margin: 0; max-width: 720px; }

    /* ---------- roster ---------- */
    .cs-roster { display: flex; align-items: flex-start; gap: 22px; }
    .cs-five { display: flex; flex-wrap: wrap; gap: 14px; flex: 1; min-width: 0; }
    .cs-seat { display: flex; flex-direction: column; gap: 8px; width: 180px; }
    .cs-seat-top { display: flex; align-items: center; gap: 5px; min-height: 18px; flex-wrap: wrap; }
    .cs-role {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px;
        color: var(--rc);
        background: color-mix(in srgb, var(--rc) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--rc) 28%, transparent);
    }
    .cs-gap {
        width: 180px; height: 252px;
        border-radius: 14px;
        border: 2px dashed rgba(51, 65, 85, 0.28);
        background: rgba(12, 16, 28, 0.35);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    }
    .cs-gap-r { font-size: 12px; font-weight: 800; color: #334155; letter-spacing: 1px; }
    .cs-gap-t { font-size: 10px; color: #334155; }

    .cs-staff {
        flex-shrink: 0;
        width: 214px;
        padding-left: 22px;
        border-left: 1px solid rgba(51, 65, 85, 0.22);
    }

    .cs-note { font-size: 11px; line-height: 1.65; color: #4a5b76; margin: 0; }

    /* ---------- empty ---------- */
    .cs-empty {
        border: 1px dashed rgba(51, 65, 85, 0.35);
        border-radius: 14px;
        padding: 22px 18px;
        text-align: center;
    }
    .cs-empty-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 14px; font-weight: 700; color: #94a3b8;
        margin-bottom: 6px;
    }
    .cs-empty-p { font-size: 11.5px; line-height: 1.65; color: #56688a; margin: 0 auto; max-width: 380px; }

    /* ---------- responsive ---------- */
    @media (max-width: 1180px) {
        .cs-roster { flex-direction: column; }
        .cs-staff {
            width: 100%;
            padding-left: 0;
            padding-top: 18px;
            border-left: none;
            border-top: 1px solid rgba(51, 65, 85, 0.22);
        }
    }
    @media (max-width: 860px) {
        .cs-head { flex-wrap: wrap; gap: 14px; }
        .cs-num {
            flex-direction: row; align-items: baseline; gap: 10px;
            padding-left: 0;
            border-left: none;
        }
        .cs-str { font-size: 24px; }
        .cs-str-l { margin-top: 0; }
        .cs-five { justify-content: center; }
    }
    @media (max-width: 420px) {
        .cs-seat, .cs-gap { width: 100%; max-width: 220px; }
    }
</style>
