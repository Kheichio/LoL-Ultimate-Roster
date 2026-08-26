<script>
    // =======================================================================
    //  LoL ULTIMATE CAREER -- BRACKET
    // =======================================================================
    //  The postseason drawn out: playoffs, MSI and Worlds all run through the
    //  one state machine in engine.js, so they all render through this.
    //
    //  WHY THIS IS NOT A CLASSIC ELIMINATION TREE.
    //  A tree with elbow connectors claims "the winner of this tie plays the
    //  winner of that one". The engine does not work that way: stepBracket()
    //  merges the round's winners back in with anyone still on a bye, re-sorts
    //  the whole field by seed and re-pairs it best-against-worst
    //  (engine.js pairSeeds/stepBracket). Who you meet next is not decided
    //  until the round finishes, so a fixed tree would be drawing a lie. What
    //  is drawn instead is a round ladder: a column per round, a spine between
    //  columns that says winners flow right, and the field size at each step.
    //  If the engine ever switches to a fixed bracket, this is the file to
    //  change, and the connectors become honest.
    //
    //  BYES ARE PART OF THE FIELD, NOT DECORATION. bracket.byes holds the top
    //  seeds sitting out the opening round; they are merged into the next
    //  round's field by stepBracket(). A visualiser that walks only `rounds`
    //  shows a six-team playoff as a four-team one, which is what the previous
    //  inline panel did.
    //
    //  Everything here is defensive. The engine owns the bracket shape and a
    //  save can carry `null`, `{}`, `{ rounds: null }`, ties with a missing
    //  side, or a tie with no score yet -- all five are real states the render
    //  harness drives, and none of them may print "null" or crash.
    //
    //  ASCII only in the markup. Emoji are HTML entities.
    // =======================================================================

    import { teamById } from '../../career/constants.js';
    import { ordinal } from '../../career/ratings.js';

    /** The raw `season.bracket` the engine writes. Null is a normal state. */
    export let bracket = null;
    /** The player's club, so their path can be picked out of the draw. */
    export let myId = null;
    export let myName = 'Your club';
    export let myAccent = '#3b82f6';
    /** Accent for the whole panel -- the phase colour, when the caller has one. */
    export let accent = '#a78bfa';
    /** Set false on a screen that already has its own heading. */
    export let showHead = true;

    const FALLBACK = '#475569';

    function num(v, d = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    }

    // -- normalisation ----------------------------------------------------
    //  Accepts the shapes the engine actually writes plus the plausible
    //  neighbours, because the bracket is engine-owned and this file must not
    //  be the reason a save stops rendering.
    function bracketTeam(ref) {
        if (ref === null || ref === undefined) return null;
        if (typeof ref === 'string') {
            const t = teamById(ref);
            return {
                id: ref,
                name: t ? t.name : (ref === myId ? myName : 'TBD'),
                accent: (t && t.accent) || (ref === myId ? myAccent : FALLBACK),
                seed: 0,
                score: null,
            };
        }
        if (typeof ref !== 'object') return null;
        const id = ref.id || ref.teamId || (typeof ref.team === 'string' ? ref.team : null);
        const t = id ? teamById(id) : null;
        const sc = ref.score ?? ref.wins ?? ref.games;
        return {
            id: id || null,
            name: ref.name || (t ? t.name : (id && id === myId ? myName : 'TBD')),
            accent: ref.accent || (t && t.accent) || (id === myId ? myAccent : FALLBACK),
            seed: Math.max(0, Math.round(num(ref.seed, 0))),
            score: Number.isFinite(Number(sc)) ? Number(sc) : null,
        };
    }

    function normalizeTie(raw) {
        if (!raw || typeof raw !== 'object') return null;
        let ra = null;
        let rb = null;
        if (Array.isArray(raw.teams)) { ra = raw.teams[0]; rb = raw.teams[1]; }
        else if (Array.isArray(raw.sides)) { ra = raw.sides[0]; rb = raw.sides[1]; }
        else {
            ra = raw.a ?? raw.home ?? raw.teamA ?? raw.top ?? raw.left ?? raw.one;
            rb = raw.b ?? raw.away ?? raw.teamB ?? raw.bottom ?? raw.right ?? raw.two;
        }
        const A = bracketTeam(ra);
        const B = bracketTeam(rb);
        if (!A && !B) return null;

        let sa = null;
        let sb = null;
        if (Array.isArray(raw.score) && raw.score.length >= 2) { sa = raw.score[0]; sb = raw.score[1]; }
        else if (Array.isArray(raw.result) && raw.result.length >= 2) { sa = raw.result[0]; sb = raw.result[1]; }
        else {
            sa = raw.scoreA ?? raw.aScore ?? raw.homeScore ?? raw.winsA;
            sb = raw.scoreB ?? raw.bScore ?? raw.awayScore ?? raw.winsB;
        }
        if (!Number.isFinite(Number(sa)) && A) sa = A.score;
        if (!Number.isFinite(Number(sb)) && B) sb = B.score;

        const aScore = Number.isFinite(Number(sa)) ? Number(sa) : 0;
        const bScore = Number.isFinite(Number(sb)) ? Number(sb) : 0;

        const wref = raw.winner ?? raw.winnerId ?? raw.won;
        const wid = typeof wref === 'string'
            ? wref
            : (wref && typeof wref === 'object' ? (wref.id || wref.teamId) : null);

        // A tie is only "played" once somebody has actually won it. The
        // player's own tie parks at 0-0 with no winner while the schedule
        // waits for them, and that is the one the panel must mark LIVE.
        const done = !!wid || (aScore !== bScore && (aScore > 0 || bScore > 0));
        const aWon = wid ? (!!A && A.id === wid) : (done && aScore > bScore);
        const bWon = wid ? (!!B && B.id === wid) : (done && bScore > aScore);

        const best = Math.max(1, Math.round(num(raw.bestOf, 0)) || 0);
        return {
            id: raw.id || '',
            bestOf: num(raw.bestOf, 0),
            done,
            hasScore: done || aScore > 0 || bScore > 0,
            need: best > 1 ? Math.floor(best / 2) + 1 : 0,
            a: A ? { ...A, score: aScore, won: !!aWon, mine: !!A.id && A.id === myId } : null,
            b: B ? { ...B, score: bScore, won: !!bWon, mine: !!B.id && B.id === myId } : null,
        };
    }

    function roundName(i, total, given) {
        if (given) return given;
        const fromEnd = total - 1 - i;
        if (fromEnd === 0) return 'Final';
        if (fromEnd === 1) return 'Semifinals';
        if (fromEnd === 2) return 'Quarterfinals';
        return 'Round ' + (i + 1);
    }

    function normalize(b) {
        if (!b || typeof b !== 'object') return null;

        let rawRounds = [];
        if (Array.isArray(b.rounds)) {
            rawRounds = b.rounds;
        } else {
            const flat = Array.isArray(b.matches) ? b.matches
                : Array.isArray(b.ties) ? b.ties
                : Array.isArray(b.series) ? b.series : [];
            if (flat.length) {
                const map = new Map();
                for (const m of flat) {
                    const key = m && (m.round ?? m.roundIndex ?? m.stage);
                    const k = key === undefined || key === null ? 0 : key;
                    if (!map.has(k)) map.set(k, []);
                    map.get(k).push(m);
                }
                rawRounds = [...map.entries()]
                    .sort((x, y) => (typeof x[0] === 'number' && typeof y[0] === 'number' ? x[0] - y[0] : 0))
                    .map(([k, ties]) => ({ name: typeof k === 'string' ? k : '', ties }));
            }
        }

        const rounds = rawRounds.map((r, i) => {
            const ties = Array.isArray(r)
                ? r
                : (r && (r.ties || r.matches || r.series || r.games || r.pairs)) || [];
            return {
                key: 'r' + i,
                name: roundName(i, rawRounds.length, !Array.isArray(r) && r ? (r.name || r.label) : ''),
                ties: (Array.isArray(ties) ? ties : []).map(normalizeTie).filter(Boolean),
            };
        }).filter(r => r.ties.length);

        const byes = (Array.isArray(b.byes) ? b.byes : [])
            .map(bracketTeam)
            .filter(Boolean)
            .map(t => ({ ...t, mine: !!t.id && t.id === myId }))
            .sort((x, y) => (x.seed || 99) - (y.seed || 99));

        if (!rounds.length && !byes.length) return null;

        const champ = bracketTeam(b.champion ?? b.winner ?? b.winnerId ?? b.championId);
        const runner = bracketTeam(b.runnerUp ?? b.runnerup ?? b.second);

        return {
            title: b.title || b.name || 'Bracket',
            bestOf: num(b.bestOf, 0),
            done: !!b.done,
            placement: Math.max(0, Math.round(num(b.myPlacement, 0))),
            champion: champ && champ.id ? { ...champ, mine: champ.id === myId } : null,
            runnerUp: runner && runner.id ? { ...runner, mine: runner.id === myId } : null,
            rounds,
            byes,
        };
    }

    $: view = normalize(bracket);

    // Byes belong to the opening round: stepBracket() folds them into the next
    // round's field the moment that round resolves, so while they exist they
    // are literally sitting out column one.
    $: columns = !view ? [] : view.rounds.map((r, i) => ({
        ...r,
        byes: i === 0 ? view.byes : [],
        teams: r.ties.length * 2 + (i === 0 ? view.byes.length : 0),
    }));

    $: liveTieId = (() => {
        if (!view) return '';
        for (let i = view.rounds.length - 1; i >= 0; i--) {
            const tie = view.rounds[i].ties.find(t => !t.done && (t.a?.mine || t.b?.mine));
            if (tie) return tie.id || ('r' + i);
        }
        return '';
    })();

    /**
     * engine.finishBracket() writes myPlacement as a finishing POSITION -
     * 1, 2, or 2^roundsFromEnd + 1, so 3 / 5 / 9. It is not a field size, and
     * reading it as one produced "You went out in the last 3." A position is
     * also the only reading that stays true when openBracket() pads a six-team
     * playoff up to eight with byes: "the last 8" would be a lie there,
     * "you finished 5th" is not.
     */
    function placementLine(v) {
        if (!v || !v.placement) return '';
        if (v.placement === 1) return 'You won it.';
        if (v.placement === 2) return 'You lost the final.';
        return 'You finished ' + ordinal(v.placement) + '.';
    }

    /** Bo5 as pips rather than a bare number, so a 3-2 reads as a series. */
    function pips(n, need) {
        const total = Math.max(0, Math.round(need) || 0);
        if (!total) return [];
        const won = Math.max(0, Math.min(total, Math.round(n) || 0));
        return Array.from({ length: total }, (_, i) => i < won);
    }
</script>

{#if !view}
    <div class="bkv-empty">
        <div class="bkv-empty-ico" aria-hidden="true">&#x1F3C6;</div>
        <h3 class="bkv-empty-h">No bracket running</h3>
        <p class="bkv-empty-p">
            Playoff and international brackets appear here during the postseason
            weeks. Finish top six in the regular split to be drawn into one.
        </p>
    </div>
{:else}
    <div class="bkv" style="--a:{accent}">
        {#if showHead}
            <div class="bkv-head">
                <span class="bkv-title">{view.title}</span>
                {#if view.bestOf > 1}<span class="bkv-bo">Best of {view.bestOf}</span>{/if}
                {#if view.champion}
                    <span class="bkv-champ" class:bkv-mine={view.champion.mine} style="--t:{view.champion.accent}">
                        <span aria-hidden="true">&#x1F3C6;</span> {view.champion.name}
                    </span>
                {:else}
                    <span class="bkv-live-tag">In progress</span>
                {/if}
            </div>
            {#if placementLine(view)}
                <p class="bkv-verdict">{placementLine(view)}</p>
            {/if}
        {/if}

        <div class="bkv-scroll">
            <div class="bkv-grid">
                {#each columns as col, ci (col.key)}
                    <div class="bkv-col">
                        <div class="bkv-rname">
                            <span class="bkv-rn">{col.name}</span>
                            <span class="bkv-rc">{col.teams} in</span>
                        </div>

                        <div class="bkv-slots">
                            <!-- Keyed on POSITION first. A keyed each block throws
                                 outright on a duplicate key, and a hand-edited save can
                                 easily carry two ties with the same id (or none at all);
                                 position is unique by construction. -->
                            {#each col.ties as t, ti (ci + '-' + ti + '-' + (t.id || ''))}
                                <div
                                    class="bkv-tie"
                                    class:bkv-tie-open={!t.done}
                                    class:bkv-tie-mine={!!(t.a?.mine || t.b?.mine)}
                                    class:bkv-tie-live={!!t.id && t.id === liveTieId}
                                >
                                    {#each [t.a, t.b] as side}
                                        {#if side}
                                            <div
                                                class="bkv-row"
                                                class:bkv-won={side.won}
                                                class:bkv-out={t.done && !side.won}
                                                class:bkv-you={side.mine}
                                                style="--t:{side.accent}"
                                            >
                                                <span class="bkv-bar" aria-hidden="true"></span>
                                                {#if side.seed > 0}<span class="bkv-seed">{side.seed}</span>{/if}
                                                <span class="bkv-name">{side.name}</span>
                                                {#if t.need > 0}
                                                    <span class="bkv-pips" aria-hidden="true">
                                                        {#each pips(side.score, t.need) as filled}
                                                            <i class:on={filled}></i>
                                                        {/each}
                                                    </span>
                                                {/if}
                                                <span class="bkv-sc">{t.hasScore ? side.score : '-'}</span>
                                            </div>
                                        {:else}
                                            <div class="bkv-row bkv-tbd">
                                                <span class="bkv-bar" aria-hidden="true"></span>
                                                <span class="bkv-name">TBD</span>
                                                <span class="bkv-sc">-</span>
                                            </div>
                                        {/if}
                                    {/each}
                                    {#if !!t.id && t.id === liveTieId}
                                        <div class="bkv-tag">Your tie &middot; not played</div>
                                    {/if}
                                </div>
                            {/each}

                            <!-- Same rule, and here it is not hypothetical: two byes
                                 with unresolvable ids both come back named "TBD". -->
                            {#each col.byes as b, bi (ci + '-bye-' + bi)}
                                <div class="bkv-tie bkv-bye" class:bkv-tie-mine={b.mine}>
                                    <div class="bkv-row bkv-byerow" class:bkv-you={b.mine} style="--t:{b.accent}">
                                        <span class="bkv-bar" aria-hidden="true"></span>
                                        {#if b.seed > 0}<span class="bkv-seed">{b.seed}</span>{/if}
                                        <span class="bkv-name">{b.name}</span>
                                    </div>
                                    <div class="bkv-tag bkv-tag-bye">Bye to the next round</div>
                                </div>
                            {/each}
                        </div>
                    </div>

                    {#if ci < columns.length - 1}
                        <div class="bkv-spine" aria-hidden="true">
                            <span class="bkv-spine-line"></span>
                            <span class="bkv-spine-tip"></span>
                        </div>
                    {/if}
                {/each}

                {#if view.champion || view.runnerUp}
                    <div class="bkv-spine" aria-hidden="true">
                        <span class="bkv-spine-line"></span>
                        <span class="bkv-spine-tip"></span>
                    </div>
                    <div class="bkv-col bkv-col-cup">
                        <div class="bkv-rname"><span class="bkv-rn">Champion</span></div>
                        <div class="bkv-cup">
                            {#if view.champion}
                                <div class="bkv-cup-ico" aria-hidden="true">&#x1F3C6;</div>
                                <div class="bkv-cup-name" class:bkv-you={view.champion.mine} style="--t:{view.champion.accent}">
                                    {view.champion.name}
                                </div>
                            {/if}
                            {#if view.runnerUp}
                                <div class="bkv-cup-second">
                                    <span aria-hidden="true">&#x1F948;</span> {view.runnerUp.name}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <p class="bkv-foot">
            Winners are re-seeded into the next round rather than following a fixed
            path, so who you meet next is decided when the round ends.
        </p>
    </div>
{/if}

<style>
    /* ---------- empty ---------- */
    .bkv-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; padding: 26px 18px; gap: 6px;
    }
    .bkv-empty-ico { font-size: 26px; opacity: 0.45; }
    .bkv-empty-h { font-size: 13px; font-weight: 900; color: #94a3b8; }
    .bkv-empty-p { font-size: 11.5px; color: #52627d; line-height: 1.6; max-width: 380px; }

    /* ---------- shell ---------- */
    .bkv { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

    .bkv-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .bkv-title { font-size: 13px; font-weight: 900; color: #e2e8f0; letter-spacing: 0.2px; }
    .bkv-bo {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px;
        color: var(--a); padding: 3px 8px; border-radius: 999px;
        background: color-mix(in srgb, var(--a) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--a) 30%, transparent);
    }
    .bkv-live-tag {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px;
        color: #64748b; padding: 3px 8px; border-radius: 999px;
        border: 1px solid rgba(71, 85, 105, 0.35);
    }
    .bkv-champ {
        margin-left: auto;
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11px; font-weight: 900; color: var(--t);
        padding: 4px 10px; border-radius: 999px;
        background: color-mix(in srgb, var(--t) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--t) 34%, transparent);
    }
    .bkv-verdict { font-size: 11px; font-weight: 700; color: #94a3b8; margin-top: -4px; }

    /* ---------- the ladder ---------- */
    .bkv-scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; }
    .bkv-grid { display: flex; align-items: stretch; gap: 0; min-width: min-content; }

    .bkv-col { display: flex; flex-direction: column; gap: 10px; min-width: 178px; }
    .bkv-col-cup { min-width: 150px; }

    .bkv-rname {
        display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
        padding-bottom: 6px; border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    }
    .bkv-rn {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.3px;
        color: #64748b; white-space: nowrap;
    }
    .bkv-rc { font-size: 9px; font-weight: 800; color: #3f4c63; white-space: nowrap; }

    /* space-around is what keeps a two-tie column visually centred against a
       four-tie one without any per-round arithmetic */
    .bkv-slots { flex: 1; display: flex; flex-direction: column; justify-content: space-around; gap: 10px; }

    .bkv-tie {
        display: flex; flex-direction: column; gap: 2px;
        padding: 5px; border-radius: 10px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.28);
    }
    .bkv-tie-open { border-style: dashed; }
    .bkv-tie-mine { border-color: color-mix(in srgb, var(--a) 40%, transparent); background: rgba(30, 41, 59, 0.5); }
    .bkv-tie-live { border-color: #fbbf24; box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.18); }

    .bkv-row {
        position: relative;
        display: flex; align-items: center; gap: 6px;
        padding: 5px 7px 5px 10px; border-radius: 7px;
        background: rgba(2, 6, 23, 0.4);
    }
    .bkv-bar {
        position: absolute; left: 3px; top: 5px; bottom: 5px; width: 2px;
        border-radius: 2px; background: var(--t, #475569);
    }
    .bkv-seed {
        flex: none; min-width: 14px; text-align: center;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 8.5px; font-weight: 800; color: #64748b;
    }
    .bkv-name {
        flex: 1; min-width: 0;
        font-size: 11px; font-weight: 800; color: #94a3b8;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bkv-sc {
        flex: none;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 900; color: #64748b;
    }
    .bkv-pips { flex: none; display: inline-flex; gap: 2px; }
    .bkv-pips i {
        width: 4px; height: 4px; border-radius: 50%;
        background: rgba(71, 85, 105, 0.55);
    }
    .bkv-pips i.on { background: var(--t, #94a3b8); }

    .bkv-won .bkv-name { color: #e2e8f0; }
    .bkv-won .bkv-sc { color: #34d399; }
    .bkv-out { opacity: 0.5; }
    .bkv-you .bkv-name { color: var(--t, #e2e8f0); font-weight: 900; }
    .bkv-tbd .bkv-name { color: #475569; font-style: italic; font-weight: 700; }

    .bkv-tag {
        font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        color: #fbbf24; padding: 2px 4px;
    }
    .bkv-tag-bye { color: #64748b; }

    .bkv-bye { border-style: dotted; }
    .bkv-byerow { background: rgba(2, 6, 23, 0.25); }

    /* The connector. Deliberately a single flow line rather than per-tie elbows
       -- see the note at the top of this file. */
    .bkv-spine {
        position: relative; flex: none; width: 26px;
        display: flex; align-items: center; justify-content: center;
        margin-top: 24px;
    }
    .bkv-spine-line {
        width: 100%; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(71, 85, 105, 0.55), transparent);
    }
    .bkv-spine-tip {
        position: absolute; right: 5px;
        width: 5px; height: 5px;
        border-top: 1px solid rgba(100, 116, 139, 0.75);
        border-right: 1px solid rgba(100, 116, 139, 0.75);
        transform: rotate(45deg);
    }

    .bkv-cup {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 6px; padding: 12px 8px; border-radius: 12px;
        background: rgba(30, 41, 59, 0.35);
        border: 1px solid color-mix(in srgb, var(--a) 26%, transparent);
        text-align: center;
    }
    .bkv-cup-ico { font-size: 22px; }
    .bkv-cup-name { font-size: 12px; font-weight: 900; color: var(--t, #e2e8f0); }
    .bkv-cup-second { font-size: 10px; font-weight: 700; color: #64748b; }

    .bkv-foot { font-size: 9.5px; color: #3f4c63; line-height: 1.5; }

    @media (max-width: 520px) {
        .bkv-col { min-width: 152px; }
        .bkv-spine { width: 18px; }
    }
</style>
