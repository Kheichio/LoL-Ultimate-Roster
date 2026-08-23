<script>
    // ===================================================================
    //  CAREER -- PROFILE
    // ===================================================================
    //  The player, their numbers, and their legacy. Everything here is a
    //  read of the career store plus the pure readers in ratings.js and
    //  awards.js -- the only thing this screen writes is the retirement
    //  overlay request, which CareerOverlay owns from there.

    import Card from '../card/Card.svelte';

    import {
        career, careerOVR, careerPotOVR, currentTeam, soloRank, marketValue,
        careerOverlay, saveCareer,
    } from '../../stores/career.js';
    import {
        ATTRS, ATTR_BY_KEY, ROLE_BY_ID, REGION_BY_ID, PLAYSTYLE_BY_ID,
        CHAMPION_BY_ID, PATH_BY_ID, teamById, RETIREMENT_AGE_MIN,
    } from '../../career/constants.js';
    import {
        ovrTier, ovrLabel, ageBand, growthFor, statusInfo, toCareerCard,
        rankFromMMR, fmtGold, fmtKDA, fmtRecord, ordinal,
    } from '../../career/ratings.js';
    import {
        MILESTONES, claimedMilestoneIds, awardHistoryByYear, AWARD_BY_ID,
        legacyScore, legacyTier, LEGACY_TIER_BANDS, peakOVR, careerYears,
        canRetire,
    } from '../../career/awards.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    // Award / trophy tiers share one palette across the whole screen.
    const TONE = { legendary: '#eab308', major: '#a78bfa', minor: '#64748b' };
    const TIER_NAME = { legendary: 'Legendary', major: 'Major', minor: 'Minor' };
    const SPLIT_NAME = { spring: 'Spring', summer: 'Summer' };
    // Em dash, built from its code point so this file stays pure ASCII.
    const DASH = String.fromCharCode(8212);

    function toneOf(t) { return TONE[t] || TONE.minor; }

    // ---- identity -----------------------------------------------------
    $: c = $career;
    $: p = c.player;
    $: region = REGION_BY_ID[p.region] || REGION_BY_ID.LEC;
    $: role = ROLE_BY_ID[p.role] || ROLE_BY_ID.MID;
    $: style = PLAYSTYLE_BY_ID[p.playstyle] || null;
    $: champ = CHAMPION_BY_ID[p.champion] || null;
    $: path = PATH_BY_ID[p.path] || PATH_BY_ID.precomp;
    $: teamName = $currentTeam ? $currentTeam.name : 'Free Agent';
    $: teamAccent = $currentTeam ? $currentTeam.accent : '#64748b';
    $: statusI = statusInfo(p.status);
    $: careerCard = toCareerCard(p, teamName, c.time.year);
    $: tier = ovrTier($careerOVR);
    $: band = ageBand(p.age);
    $: growth = growthFor(p.age);
    $: years = careerYears(c);
    $: headroom = Math.max(0, $careerPotOVR - $careerOVR);
    $: peakRank = rankFromMMR(c.soloq.peakMMR || 0);
    $: styleFocus = style
        ? Object.keys(style.growth || {})
            .filter(k => (style.growth[k] || 0) > 1)
            .map(k => (ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].abbr : null))
            .filter(Boolean).join(' ')
        : '';

    // ---- attributes ---------------------------------------------------
    $: attrRows = ATTRS.map(a => {
        const cur = Math.round(p.attrs[a.key] || 0);
        const pot = Math.max(cur, Math.round(p.potential[a.key] || 0));
        return {
            ...a,
            cur, pot,
            room: pot - cur,
            weight: Math.round((role.weights[a.key] || 0) * 100),
        };
    });

    // ---- totals -------------------------------------------------------
    $: t = c.totals;
    $: decided = (t.wins || 0) + (t.losses || 0);
    $: winRate = decided > 0 ? Math.round((t.wins / decided) * 100) : 0;
    $: kda = fmtKDA(t.kills, t.deaths, t.assists);
    $: avgRating = (t.games || 0) > 0 ? Math.round((t.ratingSum / t.games) * 100) / 100 : 0;
    $: peak = peakOVR(c);

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
    $: earnings = careerEarnings(c);

    // ---- honours ------------------------------------------------------
    $: awardYears = awardHistoryByYear(c);
    $: awardCount = awardYears.reduce((s, y) => s + y.awards.length, 0);
    $: awardLegacy = awardYears.reduce((s, y) => s + (y.legacyPoints || 0), 0);
    $: trophies = (Array.isArray(c.trophies) ? c.trophies : [])
        .filter(Boolean)
        .slice()
        .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));

    // ---- milestones ---------------------------------------------------
    let msFilter = 'all';
    $: doneIds = claimedMilestoneIds(c);
    $: msRows = MILESTONES.map(m => ({ ...m, done: doneIds.has(m.id) }));
    $: msDone = msRows.filter(m => m.done).length;
    $: msShown = msRows.filter(m => msFilter === 'all' || (msFilter === 'done' ? m.done : !m.done));

    function setFilter(f) {
        if (msFilter === f) return;
        msFilter = f;
        playSound('click');
    }

    // ---- legacy -------------------------------------------------------
    $: lScore = legacyScore(c);
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

    $: historyRows = (Array.isArray(c.history) ? c.history : [])
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
            awards: rowAwards(c, h),
        }))
        .sort((a, b) => (b.year - a.year) || ((b.split === 'summer' ? 1 : 0) - (a.split === 'summer' ? 1 : 0)));

    // ---- retirement ----------------------------------------------------
    $: gate = canRetire(c);

    function openRetire() {
        if (!gate.ok) {
            playSound('click');
            showToast(gate.reason, 'error');
            return;
        }
        playSound('click');
        careerOverlay.set({ kind: 'retire' });
        saveCareer();
    }

    function viewSummary() {
        playSound('click');
        careerOverlay.set({ kind: 'retire' });
        saveCareer();
    }
</script>

<section class="pf">
    <!-- ============ HERO ============ -->
    <header class="hero panel">
        <div class="hero-card">
            <Card card={careerCard} />
            <p class="hero-cap">{teamName} &#183; {c.time.year} season</p>
        </div>

        <div class="hero-id">
            <div class="id-top">
                <h2 class="id-name">{p.handle || 'Rookie'}</h2>
                <span class="id-flag" aria-hidden="true">{region.flag}</span>
                <span class="tag" style="--k:{role.accent}">{role.short}</span>
                <span class="tag" style="--k:{path.accent}">{path.name}</span>
                {#if c.flags.retired}
                    <span class="tag" style="--k:#ef4444">Retired</span>
                {/if}
            </div>

            <p class="id-line">
                {ovrLabel($careerOVR)} {role.name} &#183; {region.name} ({region.league})
                &#183; {years} {years === 1 ? 'year' : 'years'} as a pro
            </p>

            <div class="id-grid">
                <div class="id-cell">
                    <span class="lbl">Age</span>
                    <span class="val">{p.age}</span>
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
                    <span class="lbl">Path</span>
                    <span class="val val-sm">{path.name}</span>
                    <span class="sub">{path.tag}</span>
                </div>
                <div class="id-cell">
                    <span class="lbl">Years Pro</span>
                    <span class="val">{years}</span>
                    <span class="sub">started at {p.startAge}</span>
                </div>
            </div>

            {#if p.contract}
                <p class="id-contract">
                    Contracted to {teamName} through {p.contract.endYear || c.time.year}
                    {#if p.contract.salary}<span class="dot">&#183;</span> {fmtGold(p.contract.salary)} gold / week{/if}
                </p>
            {:else}
                <p class="id-contract id-contract-free">
                    No contract. Offers arrive through the Transfers screen once scouts rate you.
                </p>
            {/if}
        </div>

        <div class="hero-num">
            <div class="num num-big" style="--k:{tier.color}">
                <span class="num-v">{$careerOVR}</span>
                <span class="num-l">Overall</span>
                <span class="num-s">{ovrLabel($careerOVR)} &#183; {tier.quality}</span>
            </div>
            <div class="num" style="--k:#a78bfa">
                <span class="num-v">{$careerPotOVR}</span>
                <span class="num-l">Potential</span>
                <span class="num-s">{headroom > 0 ? '+' + headroom + ' still to find' : 'Ceiling reached'}</span>
            </div>
            <div class="num" style="--k:#14b8a6">
                <span class="num-v">{fmtGold($marketValue)}</span>
                <span class="num-l">Market value</span>
                <span class="num-s">what a buyout would cost</span>
            </div>
            <div class="num" style="--k:{$soloRank.color}">
                <span class="num-v num-v-sm">{$soloRank.label}</span>
                <span class="num-l">Solo queue</span>
                <span class="num-s">peak {peakRank.label} &#183; {Math.round(c.soloq.peakMMR || 0)} MMR</span>
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
            <p class="note">
                Weights below are for {role.name}. The ghosted part of each bar is your hidden ceiling &#8212;
                training can never push past it.
            </p>

            <div class="dev">
                <div class="dev-n">&#215;{growth.toFixed(2)}</div>
                <div class="dev-txt">
                    <div class="dev-t">{band.name} &#183; age {p.age}</div>
                    <div class="dev-d">{band.desc}</div>
                </div>
                <div class="dev-note">Every training gain is multiplied by this. It drops on every birthday.</div>
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
                <p class="lg-next lg-next-top">Nothing above this. The ladder ends with you.</p>
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
                            <span class="rung-you">you are here</span>
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

    <!-- ============ CAREER TOTALS ============ -->
    <div class="panel pad">
        <div class="slab">Career Totals</div>
        {#if (t.games || 0) === 0}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F4CA;</span>
                <p class="empty-t">No professional games yet.</p>
                <p class="empty-p">
                    {p.clubId
                        ? 'Your record starts with the first fixture you are named in. Check the Season screen for the games this week.'
                        : 'Nothing counts until a club signs you. Climb solo queue and take an offer from the Transfers screen.'}
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

            {#if awardCount === 0 && trophies.length === 0}
                <div class="empty">
                    <span class="empty-ico" aria-hidden="true">&#x1F3C6;</span>
                    <p class="empty-t">The cabinet is empty.</p>
                    <p class="empty-p">
                        Awards are voted at the end of every split &#8212; All-Pro selections, MVPs, and the
                        titles that come with winning playoffs. Play a full split with a club to be eligible.
                    </p>
                </div>
            {:else}
                {#if trophies.length}
                    <div class="shelf">
                        {#each trophies as tr, i (tr.id + '-' + tr.year + '-' + i)}
                            <div class="troph" style="--k:{toneOf(tr.kind)}" title="{tr.name} &#183; {tr.year}">
                                <span class="troph-ico" aria-hidden="true">{tr.icon || '\u{1F3C6}'}</span>
                                <span class="troph-n">{tr.name}</span>
                                <span class="troph-y">{tr.year}</span>
                            </div>
                        {/each}
                    </div>
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
                <p class="empty-p">
                    A season is written here the moment a split rolls over &#8212; the club you played it for,
                    the record, where you finished and anything you won along the way.
                </p>
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

    <!-- ============ RETIREMENT ============ -->
    <div class="panel pad retire" class:retire-open={gate.ok && !c.flags.retired}>
        <div class="slab">Retirement</div>
        <div class="ret-in">
            <div class="ret-txt">
                {#if c.flags.retired}
                    <p class="ret-h">Your career is over.</p>
                    <p class="ret-p">
                        {p.handle} finished at {p.age} with {t.games || 0} games and a legacy score of
                        {lScore.toLocaleString()} &#8212; {lTier.name}. Nothing on this page will change again.
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
            <div class="ret-act">
                {#if c.flags.retired}
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
