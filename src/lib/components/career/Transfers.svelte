<script>
    // =====================================================================
    //  LoL ULTIMATE CAREER -- Transfers
    // =====================================================================
    //  Everything about where you play next: the offers on the table, the
    //  haggling, the deal you are already on, who is watching, and the one
    //  irreversible button on the whole screen -- changing role.
    //
    //  No props. The screen reads the career stores and calls contracts.js.

    import {
        career, careerOVR, careerPotOVR, currentTeam, marketValue, soloRank,
        saveCareer, absWeek,
    } from '../../stores/career.js';
    import {
        ROLES, ROLE_BY_ID, REGION_BY_ID, CLUB_TIERS, SQUAD_STATUS,
        PLAYSTYLES, championsForRole, phaseForWeek, ATTRS, UNSIGNED_SOFT_CAP,
    } from '../../career/constants.js';
    import {
        statusInfo, fmtGold, weeklySalaryFor, SCOUT_MMR_GATE,
    } from '../../career/ratings.js';
    import {
        expireOffers, acceptOffer, rejectOffer, negotiateOffer, interestedTeams,
        contractStatusLine, contractYearsLeft, renewalOffer, requestTransfer,
        releaseFromClub, canChangeRole, roleChangePreview, changeRole,
    } from '../../career/contracts.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    // ---------------------------------------------------------------------
    //  LOCAL MIRRORS
    //  contracts.js keeps these private. The screen only reads them, so they
    //  are duplicated here rather than widening that module's export surface.
    // ---------------------------------------------------------------------
    const MAX_NEGOTIATIONS = 2;
    const T1_STARTER_FLOOR = 72;
    const STATUS_LADDER = ['benched', 'sub', 'rotation', 'starter', 'star'];
    const STATUS_SHORT = {
        benched: 'Benched', sub: 'Sub', rotation: 'Rotation',
        starter: 'Starter', star: 'Franchise',
    };
    const ARROW = '\u{2192}';

    // ---------------------------------------------------------------------
    //  DERIVED STATE
    // ---------------------------------------------------------------------
    $: c = $career;
    $: p = c.player;
    $: signed = !!p.clubId;
    $: phase = phaseForWeek(c.time.week);
    $: windowOpen = phase.id === 'offseason' || phase.id === 'preseason';
    $: nowWeek = absWeek(c);

    $: liveOffers = expireOffers(c);
    $: renewal = signed ? renewalOffer(c) : null;
    $: renewalLive = renewal ? (liveOffers.find(o => o.id === renewal.id) || null) : null;
    $: shownOffers = (renewal && !renewalLive ? [renewal] : []).concat(
        liveOffers.slice().sort((a, b) =>
            ((b.renewal ? 1 : 0) - (a.renewal ? 1 : 0)) || ((b.interest || 0) - (a.interest || 0))
        )
    );
    $: hasOffers = shownOffers.length > 0;
    $: renewalOnTable = renewalLive || renewal;

    $: scouts = interestedTeams(c, 10);
    $: yearsLeft = contractYearsLeft(c);
    $: finalYear = signed && yearsLeft <= 0;
    $: statusLine = contractStatusLine(c);
    $: roleGate = canChangeRole(c);
    $: teamAccent = $currentTeam ? $currentTeam.accent : '#64748b';
    $: askedThisYear = !!p.transferRequested && p.transferRequestYear === c.time.year;

    // Section order. The unsigned player lives on the scouting board; a
    // contracted player opens on their own deal -- unless somebody has put a
    // sheet in front of them, which always jumps the queue.
    $: order = signed
        ? { deal: hasOffers ? 2 : 1, offers: hasOffers ? 1 : 2, scout: 3, role: 4 }
        : { scout: hasOffers ? 2 : 1, offers: hasOffers ? 1 : 2, deal: 3, role: 4 };

    // ---------------------------------------------------------------------
    //  SMALL HELPERS
    // ---------------------------------------------------------------------
    function tierOf(t) { return CLUB_TIERS[t] || CLUB_TIERS[1]; }
    function regionOf(id) { return REGION_BY_ID[id] || null; }
    function ladderIndex(id) {
        const i = STATUS_LADDER.indexOf(id);
        return i < 0 ? 1 : i;
    }

    function interestBand(n) {
        const v = Number(n) || 0;
        if (v >= 88) return { label: 'First choice', color: '#eab308' };
        if (v >= 75) return { label: 'Chasing hard', color: '#22c55e' };
        if (v >= 60) return { label: 'Keen', color: '#34d399' };
        if (v >= 45) return { label: 'Watching', color: '#3b82f6' };
        if (v >= 30) return { label: 'Curious', color: '#f59e0b' };
        if (v >= 15) return { label: 'Aware of you', color: '#64748b' };
        return { label: 'Not for them', color: '#475569' };
    }

    function weeksLeft(o) {
        if (!o || !Number.isFinite(o.expiresWeek)) return null;
        return Math.max(0, o.expiresWeek - nowWeek);
    }
    function expiryLabel(o) {
        const w = weeksLeft(o);
        if (w === null) return 'No deadline';
        if (w <= 0) return 'Expires this week';
        return w === 1 ? 'Expires next week' : 'Expires in ' + w + ' weeks';
    }
    function isUrgent(o) {
        const w = weeksLeft(o);
        return w !== null && w <= 0;
    }

    // ---------------------------------------------------------------------
    //  OFFER ACTIONS
    // ---------------------------------------------------------------------
    // Offer objects are passed rather than ids on purpose: contracts.findOffer
    // accepts either, and a renewal the engine has not written into c.offers yet
    // only resolves when it is handed over whole.
    let flash = null;          // { text, tone } banner above the offer grid
    let negoId = null;         // offer currently being haggled over
    let rejectId = null;       // offer awaiting a reject confirmation
    let negoMsg = null;        // { text, outcome } from the last round
    let askSalary = 0;
    let askYears = 2;
    let askStatus = 'starter';

    // An offer that lapses or is signed simply stops rendering its panel, so a
    // dangling negoId is harmless -- and clearing it here would make the
    // reactive graph cyclical.
    $: negoOffer = negoId ? (shownOffers.find(o => o.id === negoId) || null) : null;
    $: sliderMin = negoOffer ? Math.max(25, Math.round(negoOffer.salary * 0.75)) : 25;
    $: sliderMax = negoOffer ? Math.round(negoOffer.salary * 2.2) : 100;
    $: sliderStep = negoOffer ? Math.max(5, Math.round(negoOffer.salary / 60)) : 5;

    // The club's own valuation of the seat being asked for -- the number every
    // negotiation is actually scored against.
    $: negoFair = negoOffer ? weeklySalaryFor({
        ovr: $careerOVR,
        clubTier: negoOffer.tier,
        region: negoOffer.region,
        age: p.age,
        status: askStatus,
        potentialOVR: $careerPotOVR,
    }) : 0;
    $: statusReach = negoOffer ? Math.max(0, ladderIndex(askStatus) - ladderIndex(negoOffer.status)) : 0;
    $: greed = negoOffer ? (askSalary / Math.max(25, negoFair)) + statusReach * 0.10 : 0;
    $: negoBand = !negoOffer ? null
        : greed <= 1.08 ? {
            id: 'safe', label: 'Reasonable ask', color: '#22c55e',
            text: 'Inside what they already think that seat is worth. They will usually say yes.',
        }
        : greed <= 1.35 ? {
            id: 'push', label: 'Pushing it', color: '#f59e0b',
            text: 'Above their valuation. They will haggle, and this round burns either way.',
        }
        : {
            id: 'walk', label: 'They may walk away', color: '#ef4444',
            text: 'More than a third over their valuation. Ask for this and the sheet can come off the table for good.',
        };

    // Asking for a seat the rating cannot support is not a negotiation, and
    // contracts.js still charges a round for it.
    $: askImpossible = !!negoOffer && negoOffer.tier === 1 && (
        ($careerOVR < T1_STARTER_FLOOR - 4 && askStatus !== 'benched')
        || ($careerOVR < T1_STARTER_FLOOR && ladderIndex(askStatus) > 1)
    );
    $: negoSpent = negoOffer ? (negoOffer.negotiations || 0) : 0;
    $: negoLocked = negoSpent >= MAX_NEGOTIATIONS;

    function openNego(o) {
        playSound('click');
        rejectId = null;
        negoMsg = null;
        negoId = o.id;
        askSalary = o.salary;
        askYears = o.years;
        askStatus = o.status;
    }
    function closeNego() {
        playSound('click');
        negoId = null;
        negoMsg = null;
    }

    function submitNego(o) {
        const r = negotiateOffer(o, {
            salary: Math.round(askSalary),
            years: askYears,
            status: askStatus,
        });
        negoMsg = { text: r.msg, outcome: r.outcome };
        if (!r.offer) {
            negoId = null;
            flash = { text: r.msg, tone: 'bad' };
        } else {
            askSalary = r.offer.salary;
            askYears = r.offer.years;
            askStatus = r.offer.status;
        }
        saveCareer();
    }

    function doAccept(o) {
        const r = acceptOffer(o);
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        negoId = null; rejectId = null; negoMsg = null;
        flash = { text: r.msg, tone: 'good' };
        saveCareer();
    }

    function doReject(o) {
        const r = rejectOffer(o);
        if (!r.ok) { showToast(r.msg, 'error'); rejectId = null; return; }
        if (negoId === o.id) { negoId = null; negoMsg = null; }
        rejectId = null;
        flash = { text: r.msg, tone: 'bad' };
        showToast(r.msg, 'info');
        saveCareer();
    }

    // ---------------------------------------------------------------------
    //  LEAVING
    // ---------------------------------------------------------------------
    let confirmMode = null;    // 'transfer' | 'release'

    function doRequestTransfer() {
        const r = requestTransfer();
        confirmMode = null;
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        flash = { text: r.msg, tone: 'bad' };
        saveCareer();
    }

    function doRelease() {
        const r = releaseFromClub('mutual');
        confirmMode = null;
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        flash = { text: r.msg, tone: 'bad' };
        saveCareer();
    }

    // ---------------------------------------------------------------------
    //  ROLE CHANGE
    // ---------------------------------------------------------------------
    let rcRole = null;
    let rcStyle = '';
    let rcChamp = '';
    let rcConfirm = false;

    $: rcPreview = (rcRole && roleGate.ok) ? roleChangePreview(c, rcRole) : null;
    $: rcStyles = rcRole ? (PLAYSTYLES[rcRole] || []) : [];
    $: rcChamps = rcRole ? championsForRole(rcRole) : [];
    $: if (!roleGate.ok && rcRole) { rcRole = null; rcConfirm = false; }

    function pickRole(id) {
        if (id === p.role) return;
        playSound('click');
        rcConfirm = false;
        rcRole = id;
        const styles = PLAYSTYLES[id] || [];
        rcStyle = styles.length ? styles[0].id : '';
        const champs = championsForRole(id);
        rcChamp = champs.length ? champs[0].id : '';
    }

    function commitRole() {
        const r = changeRole(rcRole, rcStyle, rcChamp);
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        rcRole = null; rcConfirm = false; rcStyle = ''; rcChamp = '';
        flash = { text: r.msg, tone: 'good' };
        saveCareer();
    }
</script>

<section class="tf">
    <!-- ============================ HEAD ============================ -->
    <div class="tf-head">
        <div class="tf-title">
            <h2 class="tf-h">Transfer Centre</h2>
            <p class="tf-sub">{statusLine}</p>
        </div>
        <div class="tf-chips">
            <div class="chip">
                <span class="chip-l">Market value</span>
                <span class="chip-v">{fmtGold($marketValue)}</span>
            </div>
            <div class="chip">
                <span class="chip-l">Offers</span>
                <span class="chip-v">{shownOffers.length}</span>
            </div>
            <div class="chip" title="{phase.name} &#x00B7; {phase.desc}">
                <span class="chip-l">Window</span>
                <span class="chip-v" style="color:{windowOpen ? '#22c55e' : '#f59e0b'}">{windowOpen ? 'Open' : 'Closed'}</span>
            </div>
        </div>
    </div>

    <div class="tf-stack">
        <!-- ========================= OFFERS ========================= -->
        <section class="tf-sec" style="order:{order.offers}">
            <div class="side-label">Offers on the table</div>

            {#if flash}
                <div class="flash flash-{flash.tone}">
                    <span>{flash.text}</span>
                    <button class="flash-x" on:click={() => (flash = null)} aria-label="Dismiss message">&#x2715;</button>
                </div>
            {/if}

            {#if !hasOffers}
                <div class="panel empty">
                    <div class="empty-ico" aria-hidden="true">&#x1F4EA;</div>
                    <h3 class="empty-h">Nothing on the table</h3>
                    <p class="empty-p">
                        Clubs sign players in the window: the offseason (weeks 36-40) and preseason (weeks 1-4).
                        {#if !signed}
                            The one exception is you &#x2014; an unsigned prospect can get an academy call in any
                            week, but only once solo queue says you are worth the phone call: {SCOUT_MMR_GATE} MMR
                            and a rating of 50. You are on {Math.round(c.soloq.mmr)} MMR and {$careerOVR} rated.
                        {:else}
                            Keep your rating and your form up between now and then, and watch the scouting board
                            below to see who is circling.
                        {/if}
                    </p>
                    <p class="empty-sub">Currently: {phase.name}, week {c.time.week} of {c.time.year}.</p>
                </div>
            {:else}
                <div class="off-grid">
                    {#each shownOffers as o (o.id)}
                        {@const st = statusInfo(o.status)}
                        {@const tier = tierOf(o.tier)}
                        {@const reg = regionOf(o.region)}
                        {@const band = interestBand(o.interest)}
                        {@const oInt = Math.max(0, Math.min(100, Number(o.interest) || 0))}
                        {@const oYears = Number(o.years) || 0}
                        <article class="off" class:off-renew={o.renewal} style="--ac:{o.teamAccent || '#94a3b8'}">
                            <header class="off-head">
                                <div class="off-id">
                                    <span class="off-name">{o.teamName || 'Unnamed club'}</span>
                                    <div class="off-tags">
                                        {#if o.renewal}<span class="tag tag-renew">Renewal</span>{/if}
                                        <span class="tag" style="--tg:{tier.accent}">{tier.name}</span>
                                        {#if reg}
                                            <span class="tag tag-reg">
                                                <span aria-hidden="true">{reg.flag}</span> {reg.league}
                                            </span>
                                        {/if}
                                        <span class="tag" style="--tg:{ROLE_BY_ID[o.role] ? ROLE_BY_ID[o.role].accent : '#64748b'}">
                                            {ROLE_BY_ID[o.role] ? ROLE_BY_ID[o.role].short : (o.role || '-')}
                                        </span>
                                    </div>
                                </div>
                                <div class="off-wage">
                                    <span class="off-wage-v">{fmtGold(o.salary)}</span>
                                    <span class="off-wage-l">per week</span>
                                </div>
                            </header>

                            {#if o.blurb}<p class="off-blurb">{o.blurb}</p>{/if}

                            <div class="terms">
                                <div class="term">
                                    <span class="term-l">Squad status</span>
                                    <span class="term-v" style="color:{st.accent}">{st.name}</span>
                                </div>
                                <div class="term">
                                    <span class="term-l">Length</span>
                                    <span class="term-v">{oYears} {oYears === 1 ? 'year' : 'years'}</span>
                                </div>
                                <div class="term">
                                    <span class="term-l">Signing bonus</span>
                                    <span class="term-v">{o.signingBonus > 0 ? fmtGold(o.signingBonus) : 'None'}</span>
                                </div>
                                <div class="term">
                                    <span class="term-l">Release clause</span>
                                    <span class="term-v">{o.releaseClause > 0 ? fmtGold(o.releaseClause) : 'None'}</span>
                                </div>
                            </div>

                            <div class="int">
                                <div class="int-top">
                                    <span class="int-l">Club interest</span>
                                    <span class="int-r" style="color:{band.color}">{band.label} &#x00B7; {oInt}</span>
                                </div>
                                <div class="int-bar" aria-hidden="true">
                                    <div class="int-fill" style="width:{Math.max(2, oInt)}%; background:{band.color}"></div>
                                </div>
                            </div>

                            <footer class="off-foot">
                                <div class="off-meta">
                                    <span class="meta-exp" class:meta-urgent={isUrgent(o)}>{expiryLabel(o)}</span>
                                    <span class="meta-dot">&#x00B7;</span>
                                    <span>{o.negotiations || 0}/{MAX_NEGOTIATIONS} rounds used</span>
                                </div>
                                {#if rejectId === o.id}
                                    <div class="confirm-row">
                                        <span class="confirm-q">Turn them down?</span>
                                        <button class="b b-danger" on:click={() => doReject(o)}>Yes, reject</button>
                                        <button class="b b-ghost" on:click={() => (rejectId = null)}>Keep it</button>
                                    </div>
                                {:else}
                                    <div class="off-actions">
                                        <button class="b b-accept" on:click={() => doAccept(o)}>Accept</button>
                                        <button
                                            class="b b-nego"
                                            class:b-on={negoId === o.id}
                                            on:click={() => (negoId === o.id ? closeNego() : openNego(o))}
                                            aria-expanded={negoId === o.id}
                                        >Negotiate</button>
                                        <button class="b b-ghost" on:click={() => { playSound('click'); rejectId = o.id; }}>Reject</button>
                                    </div>
                                {/if}
                            </footer>

                            {#if negoId === o.id}
                                <div class="nego">
                                    <div class="nego-head">
                                        <span class="nego-h">Counter-offer</span>
                                        <span class="nego-rounds" class:nego-out={negoLocked}>
                                            {negoSpent}/{MAX_NEGOTIATIONS} rounds used
                                        </span>
                                    </div>

                                    <div class="nego-field">
                                        <div class="nf-top">
                                            <span class="nf-l">Asking salary</span>
                                            <output class="nf-v">{fmtGold(Math.round(askSalary))}/wk</output>
                                        </div>
                                        <input
                                            class="rng"
                                            type="range"
                                            min={sliderMin}
                                            max={sliderMax}
                                            step={sliderStep}
                                            bind:value={askSalary}
                                            disabled={negoLocked}
                                            aria-label="Asking weekly salary"
                                        />
                                        <div class="rng-ends">
                                            <span>{fmtGold(sliderMin)}</span>
                                            <span>Offered {fmtGold(o.salary)} &#x00B7; they value it at {fmtGold(negoFair)}</span>
                                            <span>{fmtGold(sliderMax)}</span>
                                        </div>
                                    </div>

                                    <div class="nego-field">
                                        <div class="nf-top"><span class="nf-l">Contract length</span></div>
                                        <div class="pick" role="group" aria-label="Contract length in years">
                                            {#each [1, 2, 3, 4] as y}
                                                <button
                                                    class="pick-b"
                                                    class:pick-on={askYears === y}
                                                    aria-pressed={askYears === y}
                                                    disabled={negoLocked}
                                                    on:click={() => (askYears = y)}
                                                >{y}y</button>
                                            {/each}
                                        </div>
                                    </div>

                                    <div class="nego-field">
                                        <div class="nf-top"><span class="nf-l">Squad status</span></div>
                                        <div class="pick" role="group" aria-label="Requested squad status">
                                            {#each STATUS_LADDER as sid}
                                                <button
                                                    class="pick-b"
                                                    class:pick-on={askStatus === sid}
                                                    aria-pressed={askStatus === sid}
                                                    disabled={negoLocked}
                                                    style="--pk:{SQUAD_STATUS[sid].accent}"
                                                    on:click={() => (askStatus = sid)}
                                                >{STATUS_SHORT[sid]}</button>
                                            {/each}
                                        </div>
                                    </div>

                                    {#if negoBand}
                                        <div class="band band-{negoBand.id}" style="--bd:{negoBand.color}">
                                            <span class="band-l">{negoBand.label}</span>
                                            <span class="band-t">{negoBand.text}</span>
                                        </div>
                                    {/if}

                                    {#if askImpossible}
                                        <div class="band band-walk" style="--bd:#ef4444">
                                            <span class="band-l">They will refuse outright</span>
                                            <span class="band-t">
                                                A main-league club does not promise a {STATUS_SHORT[askStatus].toLowerCase()} seat to a
                                                {$careerOVR} rated player. Asking anyway still costs you a round.
                                            </span>
                                        </div>
                                    {/if}

                                    {#if negoMsg}
                                        <div class="nego-msg nego-{negoMsg.outcome}">{negoMsg.text}</div>
                                    {/if}

                                    <div class="nego-actions">
                                        <button
                                            class="b b-nego"
                                            disabled={negoLocked}
                                            on:click={() => submitNego(o)}
                                        >{negoLocked ? 'No rounds left' : 'Send the counter'}</button>
                                        <button class="b b-ghost" on:click={closeNego}>Close</button>
                                    </div>
                                </div>
                            {/if}
                        </article>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- ====================== CURRENT DEAL ====================== -->
        <section class="tf-sec" style="order:{order.deal}">
            <div class="side-label">{signed ? 'Your contract' : 'Where you stand'}</div>

            {#if signed}
                <div class="panel deal" style="--ac:{teamAccent}">
                    <div class="deal-top">
                        <div>
                            <div class="deal-club">{$currentTeam ? $currentTeam.name : 'Your club'}</div>
                            <div class="deal-line">{statusLine}</div>
                        </div>
                        {#if askedThisYear}
                            <span class="pill pill-warn">Transfer requested</span>
                        {/if}
                    </div>

                    <div class="deal-stats">
                        <div class="ds">
                            <span class="ds-l">Squad status</span>
                            <span class="ds-v" style="color:{statusInfo(p.status).accent}">{statusInfo(p.status).name}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Weekly wage</span>
                            <span class="ds-v">{fmtGold(p.contract ? p.contract.salary : 0)}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Years left</span>
                            <span class="ds-v" class:ds-hot={finalYear}>{finalYear ? 'Final year' : yearsLeft}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Runs until</span>
                            <span class="ds-v">{p.contract ? p.contract.endYear : c.time.year}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Release clause</span>
                            <span class="ds-v">{p.contract && p.contract.releaseClause ? fmtGold(p.contract.releaseClause) : 'None'}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Market value</span>
                            <span class="ds-v ds-gold">{fmtGold($marketValue)}</span>
                        </div>
                    </div>

                    {#if finalYear}
                        {#if renewalOnTable}
                            {@const rst = statusInfo(renewalOnTable.status)}
                            <div class="renew">
                                <div class="renew-top">
                                    <span class="renew-h">Renewal offer</span>
                                    <span class="renew-sub">{expiryLabel(renewalOnTable)}</span>
                                </div>
                                <p class="renew-terms">
                                    {fmtGold(renewalOnTable.salary)}/wk
                                    &#x00B7; {renewalOnTable.years} {renewalOnTable.years === 1 ? 'year' : 'years'}
                                    &#x00B7; <span style="color:{rst.accent}">{rst.name}</span>
                                    {#if renewalOnTable.signingBonus > 0}
                                        &#x00B7; {fmtGold(renewalOnTable.signingBonus)} bonus
                                    {/if}
                                </p>
                                <div class="renew-actions">
                                    <button class="b b-accept" on:click={() => doAccept(renewalOnTable)}>Sign the renewal</button>
                                    <span class="renew-note">It is listed with the other offers if you want to haggle first.</span>
                                </div>
                            </div>
                        {:else}
                            <div class="renew renew-none">
                                <span class="renew-h">No renewal offered</span>
                                <p class="renew-terms">
                                    Your deal ends after {c.time.year} and the club has not put a new one in front of you.
                                    Find another seat before the offseason runs out or you become a free agent.
                                </p>
                            </div>
                        {/if}
                    {/if}

                    <div class="danger">
                        <div class="danger-h">Leaving early</div>

                        <div class="dz">
                            <div class="dz-copy">
                                <h4 class="dz-h">Hand in a transfer request</h4>
                                <p class="dz-p">
                                    Every scout in the region hears within the hour, so interest in you goes up.
                                    So does the damage: chemistry drops hard, morale takes a hit, and you stay on the
                                    roster with a room that knows you want out. Once per year, and it cannot be taken back.
                                </p>
                            </div>
                            {#if askedThisYear}
                                <span class="dz-done">Already asked this year</span>
                            {:else if confirmMode === 'transfer'}
                                <div class="dz-confirm">
                                    <button class="b b-danger" on:click={doRequestTransfer}>Hand it in</button>
                                    <button class="b b-ghost" on:click={() => (confirmMode = null)}>Cancel</button>
                                </div>
                            {:else}
                                <button class="b b-warn" on:click={() => { playSound('click'); confirmMode = 'transfer'; }}>Request transfer</button>
                            {/if}
                        </div>

                        <div class="dz">
                            <div class="dz-copy">
                                <h4 class="dz-h">Agree a release</h4>
                                <p class="dz-p">
                                    The contract is torn up today. No club, no wage, no scrim block, and your training
                                    is throttled again by the unsigned soft cap of {UNSIGNED_SOFT_CAP}. Morale drops.
                                    Rival offers already on the table survive &#x2014; your club's does not.
                                </p>
                            </div>
                            {#if confirmMode === 'release'}
                                <div class="dz-confirm">
                                    <button class="b b-danger" on:click={doRelease}>Tear it up</button>
                                    <button class="b b-ghost" on:click={() => (confirmMode = null)}>Cancel</button>
                                </div>
                            {:else}
                                <button class="b b-warn" on:click={() => { playSound('click'); confirmMode = 'release'; }}>Terminate contract</button>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                {@const gate = Math.min(100, Math.round((c.soloq.mmr / SCOUT_MMR_GATE) * 100))}
                <div class="panel deal" style="--ac:#a78bfa">
                    <div class="deal-top">
                        <div>
                            <div class="deal-club">No contract</div>
                            <div class="deal-line">{statusLine}</div>
                        </div>
                    </div>

                    <div class="deal-stats">
                        <div class="ds">
                            <span class="ds-l">Overall</span>
                            <span class="ds-v">{$careerOVR}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Solo queue</span>
                            <span class="ds-v" style="color:{$soloRank.color}">{$soloRank.label}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Market value</span>
                            <span class="ds-v ds-gold">{fmtGold($marketValue)}</span>
                        </div>
                        <div class="ds">
                            <span class="ds-l">Untrained cap</span>
                            <span class="ds-v">{UNSIGNED_SOFT_CAP}</span>
                        </div>
                    </div>

                    <div class="gate">
                        <div class="int-top">
                            <span class="int-l">Scout gate &#x2014; {SCOUT_MMR_GATE} MMR</span>
                            <span class="int-r" style="color:{c.soloq.mmr >= SCOUT_MMR_GATE ? '#22c55e' : '#f59e0b'}">
                                {Math.round(c.soloq.mmr)} / {SCOUT_MMR_GATE}
                            </span>
                        </div>
                        <div class="int-bar" aria-hidden="true">
                            <div class="int-fill" style="width:{Math.max(2, gate)}%; background:{c.soloq.mmr >= SCOUT_MMR_GATE ? '#22c55e' : '#a78bfa'}"></div>
                        </div>
                        <p class="gate-p">
                            An academy will call an unsigned player in any week of the year, but only once solo queue
                            backs you up: Diamond ({SCOUT_MMR_GATE} MMR) and a rating of 50. Open-circuit sides want
                            Platinum and a 48. Everything else waits for the offseason.
                        </p>
                    </div>
                </div>
            {/if}
        </section>

        <!-- ===================== SCOUTING BOARD ===================== -->
        <section class="tf-sec" style="order:{order.scout}">
            <div class="side-label">Scouting board</div>
            <p class="sec-note">
                Who is watching you right now, best first. Interest moves with your rating against theirs, your solo
                queue climb, your form, your age and your following &#x2014; and it drops for every region you would
                have to move to.
            </p>

            {#if !scouts.length}
                <div class="panel empty">
                    <div class="empty-ico" aria-hidden="true">&#x1F50D;</div>
                    <h3 class="empty-h">Nobody has you on a list</h3>
                    <p class="empty-p">
                        Train, climb, and play games that get written down. A club with no reason to know your name
                        will not invent one.
                    </p>
                </div>
            {:else}
                <div class="scout-list">
                    {#each scouts as row, i (row.team.id)}
                        {@const band = interestBand(row.interest)}
                        {@const tier = tierOf(row.team.tier)}
                        {@const reg = regionOf(row.team.region)}
                        <div class="scout" style="--ac:{row.team.accent}">
                            <span class="sc-rank">{i + 1}</span>
                            <div class="sc-id">
                                <span class="sc-name">{row.team.name}</span>
                                <span class="sc-meta">
                                    <span class="sc-tier" style="--tg:{tier.accent}">{tier.short}</span>
                                    {#if reg}<span aria-hidden="true">{reg.flag}</span> {reg.league}{:else}Open circuit{/if}
                                    <span class="meta-dot">&#x00B7;</span> Strength {Math.round(row.team.strength)}
                                </span>
                            </div>
                            <div class="sc-int">
                                <div class="sc-bar" aria-hidden="true">
                                    <div class="sc-fill" style="width:{Math.max(2, row.interest)}%; background:{band.color}"></div>
                                </div>
                                <span class="sc-num" style="color:{band.color}">{row.interest}</span>
                                <span class="sc-lbl">{band.label}</span>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- ======================= ROLE CHANGE ======================= -->
        <section class="tf-sec" style="order:{order.role}">
            <div class="side-label">Role change</div>

            {#if !roleGate.ok}
                <div class="panel locked">
                    <div class="locked-ico" aria-hidden="true">&#x1F512;</div>
                    <div>
                        <h3 class="locked-h">You cannot switch role right now</h3>
                        <p class="locked-p">{roleGate.reason}</p>
                    </div>
                </div>
            {:else}
                <p class="sec-note">
                    {roleGate.reason} A switch is permanent: the habits your old role lived on rot away, and the
                    attributes the new one needs come back rusty. You get the exact number before you commit.
                </p>

                <div class="rc-roles" role="group" aria-label="Choose a new role">
                    {#each ROLES as r}
                        <button
                            class="rc-role"
                            class:rc-on={rcRole === r.id}
                            class:rc-cur={p.role === r.id}
                            style="--ac:{r.accent}"
                            disabled={p.role === r.id}
                            aria-pressed={rcRole === r.id}
                            on:click={() => pickRole(r.id)}
                        >
                            <img class="rc-ico" src={r.icon} alt="" />
                            <span class="rc-name">{r.name}</span>
                            <span class="rc-tag">{p.role === r.id ? 'Current role' : r.short}</span>
                        </button>
                    {/each}
                </div>

                {#if rcPreview && rcRole}
                    {@const toRole = ROLE_BY_ID[rcRole]}
                    <div class="panel rc-panel" style="--ac:{toRole.accent}">
                        <div class="rc-head">
                            <div class="rc-ovr">
                                <div class="rc-ovr-cell">
                                    <span class="rc-ovr-n">{rcPreview.fromOVR}</span>
                                    <span class="rc-ovr-l">{ROLE_BY_ID[p.role] ? ROLE_BY_ID[p.role].short : p.role} today</span>
                                </div>
                                <span class="rc-arrow" aria-hidden="true">{ARROW}</span>
                                <div class="rc-ovr-cell">
                                    <span class="rc-ovr-n rc-ovr-to">{rcPreview.toOVR}</span>
                                    <span class="rc-ovr-l">{toRole.short} from week one</span>
                                </div>
                                <div class="rc-loss">
                                    <span class="rc-loss-n">-{rcPreview.totalLoss}</span>
                                    <span class="rc-loss-l">overall</span>
                                </div>
                            </div>
                            <p class="rc-warn">{rcPreview.warning}</p>
                        </div>

                        <div class="rc-block">
                            <div class="side-label">What it costs, attribute by attribute</div>
                            <div class="rc-attrs">
                                {#each ATTRS as a}
                                    {@const before = Math.round(p.attrs[a.key] || 0)}
                                    {@const after = Math.round(rcPreview.newAttrs[a.key] || 0)}
                                    <div class="rc-attr" style="--ac:{a.color}">
                                        <span class="ra-k">{a.abbr}</span>
                                        <span class="ra-b">{before}</span>
                                        <span class="ra-arrow" aria-hidden="true">{ARROW}</span>
                                        <span class="ra-a">{after}</span>
                                        <span class="ra-d">{after - before}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <div class="rc-block">
                            <div class="side-label">Pick a playstyle</div>
                            <div class="rc-styles">
                                {#each rcStyles as s}
                                    <button
                                        class="rc-style"
                                        class:rc-on={rcStyle === s.id}
                                        aria-pressed={rcStyle === s.id}
                                        on:click={() => { playSound('click'); rcStyle = s.id; rcConfirm = false; }}
                                    >
                                        <span class="rs-name">{s.name}</span>
                                        <span class="rs-blurb">{s.blurb}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="rc-block">
                            <div class="side-label">Pick a signature champion</div>
                            <div class="rc-champs">
                                {#each rcChamps as ch}
                                    <button
                                        class="rc-champ"
                                        class:rc-on={rcChamp === ch.id}
                                        aria-pressed={rcChamp === ch.id}
                                        on:click={() => { playSound('click'); rcChamp = ch.id; rcConfirm = false; }}
                                    >
                                        <span class="rch-n">{ch.name}</span>
                                        <span class="rch-a">{ch.archetype}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>

                        {#if rcConfirm}
                            <div class="rc-confirm">
                                <h4 class="rcc-h">This cannot be undone</h4>
                                <p class="rcc-p">
                                    You will play {toRole.name} as a
                                    {rcStyles.find(s => s.id === rcStyle) ? rcStyles.find(s => s.id === rcStyle).name : 'specialist'}
                                    on {rcChamps.find(ch => ch.id === rcChamp) ? rcChamps.find(ch => ch.id === rcChamp).name : 'a new champion'}.
                                    Your overall drops {rcPreview.fromOVR}{ARROW}{rcPreview.toOVR}, your form drops 12,
                                    and your hidden ceiling is re-centred on the new role. There is no way back to
                                    {ROLE_BY_ID[p.role] ? ROLE_BY_ID[p.role].name : p.role} except doing this again.
                                </p>
                                <div class="rcc-actions">
                                    <button class="b b-danger" on:click={commitRole}>Switch to {toRole.short}</button>
                                    <button class="b b-ghost" on:click={() => (rcConfirm = false)}>Not yet</button>
                                </div>
                            </div>
                        {:else}
                            <div class="rc-actions">
                                <button class="b b-warn" on:click={() => { playSound('click'); rcConfirm = true; }}>Review the switch</button>
                                <button class="b b-ghost" on:click={() => { playSound('click'); rcRole = null; }}>Cancel</button>
                            </div>
                        {/if}
                    </div>
                {/if}
            {/if}
        </section>
    </div>
</section>

<style>
    .tf { max-width: 1280px; margin: 0 auto; }
    .side-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #334155; margin-bottom: 10px; }
    .sec-note { font-size: 12px; color: #56688a; line-height: 1.6; max-width: 720px; margin: -4px 0 14px; }

    /* ============ HEAD ============ */
    .tf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
    .tf-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 24px; font-weight: 800; color: #e8eefb; letter-spacing: -0.02em; }
    .tf-sub { font-size: 12px; color: #64748b; margin-top: 4px; max-width: 640px; line-height: 1.55; }
    .tf-chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .chip { display: flex; flex-direction: column; gap: 3px; padding: 8px 14px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.32); }
    .chip-l { font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }
    .chip-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; color: #cbd5e1; }
    .tf-stack { display: flex; flex-direction: column; gap: 26px; }
    .tf-sec { min-width: 0; }

    /* ============ SHARED ============ */
    .panel { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.28); border-radius: 18px; }
    .empty { padding: 30px 24px; text-align: center; }
    .empty-ico { font-size: 30px; opacity: 0.5; margin-bottom: 10px; }
    .empty-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; }
    .empty-p { font-size: 12.5px; color: #56688a; line-height: 1.7; max-width: 620px; margin: 0 auto; }
    .empty-sub { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; color: #3f5069; margin-top: 12px; text-transform: uppercase; }

    .flash { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 11px 14px; border-radius: 12px; margin-bottom: 14px; font-size: 12px; font-weight: 600; line-height: 1.5; }
    .flash-good { background: rgba(34,197,94,0.10); border: 1px solid rgba(34,197,94,0.28); color: #86efac; }
    .flash-bad { background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.26); color: #fca5a5; }
    .flash-x { flex-shrink: 0; width: 22px; height: 22px; border-radius: 7px; background: rgba(15,23,42,0.4); border: 1px solid rgba(71,85,105,0.3); color: inherit; font-size: 9px; cursor: pointer; line-height: 1; }

    /* ============ OFFERS ============ */
    .off-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
    @media (max-width: 720px) { .off-grid { grid-template-columns: 1fr; } }
    .off { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 18px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.3); border-left: 3px solid var(--ac); min-width: 0; }
    .off-renew { border-color: rgba(139,92,246,0.32); border-left-color: #a78bfa; }
    .off-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .off-id { min-width: 0; }
    .off-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; color: #e8eefb; display: block; overflow-wrap: anywhere; }
    .off-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
    .tag { font-size: 8.5px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; padding: 3px 7px; border-radius: 5px; color: var(--tg, #64748b); background: color-mix(in srgb, var(--tg, #64748b) 12%, transparent); border: 1px solid color-mix(in srgb, var(--tg, #64748b) 28%, transparent); }
    .tag-reg { --tg: #94a3b8; }
    .tag-renew { --tg: #a78bfa; }
    .off-wage { text-align: right; flex-shrink: 0; }
    .off-wage-v { display: block; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 19px; font-weight: 800; color: #fbbf24; line-height: 1; }
    .off-wage-l { font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .off-blurb { font-size: 12px; color: #7f92b3; line-height: 1.65; }

    .terms { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
    .term { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 10px; background: rgba(15,23,42,0.42); border: 1px solid rgba(51,65,85,0.2); }
    .term-l { font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .term-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12.5px; font-weight: 800; color: #cbd5e1; }

    .int-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
    .int-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }
    .int-r { font-size: 10.5px; font-weight: 800; }
    .int-bar { height: 4px; border-radius: 4px; background: rgba(148,163,184,0.12); overflow: hidden; }
    .int-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }

    .off-foot { display: flex; flex-direction: column; gap: 10px; margin-top: 2px; }
    .off-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10px; font-weight: 700; color: #475569; }
    .meta-dot { color: #2c3a52; }
    .meta-urgent { color: #f59e0b; }
    .off-actions, .confirm-row, .nego-actions, .renew-actions, .dz-confirm, .rc-actions, .rcc-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .confirm-q { font-size: 11px; font-weight: 700; color: #fca5a5; }

    /* ============ BUTTONS ============ */
    .b { padding: 8px 15px; border-radius: 10px; border: 1px solid transparent; font-family: inherit; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; transition: transform 0.12s ease, background 0.12s ease, color 0.12s ease; }
    .b:disabled { opacity: 0.45; cursor: not-allowed; }
    .b:not(:disabled):hover { transform: translateY(-1px); }
    .b-accept { background: linear-gradient(135deg, #059669, #10b981); color: #04211d; }
    .b-nego { background: rgba(139,92,246,0.14); color: #c4b5fd; border-color: rgba(139,92,246,0.32); }
    .b-nego:not(:disabled):hover { background: rgba(139,92,246,0.24); }
    .b-on { background: rgba(139,92,246,0.3); color: #ede9fe; }
    .b-ghost { background: rgba(51,65,85,0.3); color: #7f92b3; border-color: rgba(71,85,105,0.3); }
    .b-ghost:not(:disabled):hover { background: rgba(71,85,105,0.45); color: #e2e8f0; }
    .b-danger { background: linear-gradient(135deg, #dc2626, #ef4444); color: #fff; }
    .b-warn { background: rgba(239,68,68,0.1); color: #fca5a5; border-color: rgba(239,68,68,0.28); }
    .b-warn:not(:disabled):hover { background: rgba(239,68,68,0.2); }

    /* ============ NEGOTIATION ============ */
    .nego { display: flex; flex-direction: column; gap: 13px; padding: 14px; border-radius: 14px; background: rgba(139,92,246,0.055); border: 1px solid rgba(139,92,246,0.22); }
    .nego-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .nego-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; color: #c4b5fd; }
    .nego-rounds { font-size: 9px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #475569; }
    .nego-out { color: #f87171; }
    .nego-field { display: flex; flex-direction: column; gap: 7px; }
    .nf-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .nf-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }
    .nf-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; font-weight: 800; color: #fbbf24; }

    .rng { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 99px; background: rgba(148,163,184,0.16); outline: none; cursor: pointer; }
    .rng:disabled { cursor: not-allowed; opacity: 0.5; }
    .rng::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #a78bfa; border: 2px solid #070b14; cursor: pointer; box-shadow: 0 0 0 3px rgba(139,92,246,0.18); }
    .rng::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #a78bfa; border: 2px solid #070b14; cursor: pointer; }
    .rng-ends { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 9px; font-weight: 700; color: #475569; text-align: center; }
    .rng-ends span:nth-child(2) { color: #56688a; }

    .pick { display: flex; flex-wrap: wrap; gap: 5px; }
    .pick-b { padding: 6px 11px; border-radius: 8px; background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.32); font-family: inherit; font-size: 10.5px; font-weight: 800; color: #64748b; cursor: pointer; }
    .pick-b:not(:disabled):hover { color: #cbd5e1; border-color: rgba(71,85,105,0.6); }
    .pick-b:disabled { opacity: 0.45; cursor: not-allowed; }
    .pick-on { color: var(--pk, #c4b5fd); background: color-mix(in srgb, var(--pk, #8b5cf6) 14%, transparent); border-color: color-mix(in srgb, var(--pk, #8b5cf6) 40%, transparent); }

    .band { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 10px; background: color-mix(in srgb, var(--bd) 9%, transparent); border: 1px solid color-mix(in srgb, var(--bd) 26%, transparent); }
    .band-l { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: var(--bd); }
    .band-t { font-size: 11px; color: #8ea0be; line-height: 1.55; }
    .nego-msg { font-size: 11.5px; line-height: 1.6; padding: 9px 11px; border-radius: 10px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); color: #94a3b8; }
    .nego-improved { color: #86efac; border-color: rgba(34,197,94,0.28); }
    .nego-partial { color: #fcd34d; border-color: rgba(245,158,11,0.28); }
    .nego-withdrawn { color: #fca5a5; border-color: rgba(239,68,68,0.28); }

    /* ============ CURRENT DEAL ============ */
    .deal { padding: 18px; border-left: 3px solid var(--ac); }
    .deal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .deal-club { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 18px; font-weight: 700; color: #e8eefb; }
    .deal-line { font-size: 11.5px; color: #56688a; margin-top: 5px; line-height: 1.6; }
    .pill { font-size: 9px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; padding: 5px 10px; border-radius: 7px; }
    .pill-warn { color: #fca5a5; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.26); }
    .deal-stats { display: grid; gap: 8px; margin-top: 16px; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
    .ds { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: rgba(15,23,42,0.42); border: 1px solid rgba(51,65,85,0.2); }
    .ds-l { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }
    .ds-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; font-weight: 800; color: #e2e8f0; }
    .ds-gold { color: #fbbf24; }
    .ds-hot { color: #f97316; }

    .renew { margin-top: 16px; padding: 14px; border-radius: 14px; background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.24); }
    .renew-none { background: rgba(15,23,42,0.4); border-color: rgba(51,65,85,0.28); }
    .renew-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .renew-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; color: #c4b5fd; }
    .renew-none .renew-h { color: #94a3b8; }
    .renew-sub { font-size: 9.5px; font-weight: 700; color: #475569; }
    .renew-terms { font-size: 12px; color: #8ea0be; line-height: 1.65; margin-top: 7px; }
    .renew-actions { margin-top: 11px; }
    .renew-note { font-size: 10.5px; color: #475569; }

    .danger { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(51,65,85,0.26); display: flex; flex-direction: column; gap: 14px; }
    .danger-h { font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #7f1d1d; }
    .dz { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .dz-copy { flex: 1; min-width: 220px; }
    .dz-h { font-size: 12.5px; font-weight: 700; color: #cbd5e1; }
    .dz-p { font-size: 11.5px; color: #56688a; line-height: 1.65; margin-top: 4px; max-width: 620px; }
    .dz-done { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #475569; }
    .gate { margin-top: 16px; }
    .gate-p { font-size: 11.5px; color: #56688a; line-height: 1.7; margin-top: 10px; max-width: 660px; }

    /* ============ SCOUTING ============ */
    .scout-list { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }
    @media (max-width: 700px) { .scout-list { grid-template-columns: 1fr; } }
    .scout { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.24); border-left: 3px solid var(--ac); min-width: 0; }
    .sc-rank { flex-shrink: 0; width: 20px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: #334155; }
    .sc-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .sc-name { font-size: 13px; font-weight: 700; color: #dbe4f5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sc-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 9.5px; font-weight: 700; color: #475569; }
    .sc-tier { font-size: 8px; font-weight: 900; letter-spacing: 0.6px; padding: 2px 5px; border-radius: 4px; color: var(--tg); background: color-mix(in srgb, var(--tg) 12%, transparent); }
    .sc-int { flex-shrink: 0; width: 96px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
    .sc-bar { width: 100%; height: 4px; border-radius: 4px; background: rgba(148,163,184,0.12); overflow: hidden; }
    .sc-fill { height: 100%; border-radius: 4px; }
    .sc-num { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; line-height: 1; }
    .sc-lbl { font-size: 8.5px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #3f5069; }

    /* ============ ROLE CHANGE ============ */
    .locked { display: flex; align-items: flex-start; gap: 14px; padding: 18px; }
    .locked-ico { font-size: 22px; opacity: 0.55; line-height: 1.2; }
    .locked-h { font-size: 14px; font-weight: 700; color: #cbd5e1; }
    .locked-p { font-size: 12px; color: #56688a; line-height: 1.7; margin-top: 6px; max-width: 700px; }
    .rc-roles { display: grid; gap: 8px; margin-bottom: 16px; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
    .rc-role { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 10px; border-radius: 14px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.28); font-family: inherit; cursor: pointer; transition: border-color 0.12s ease, background 0.12s ease; }
    .rc-role:not(:disabled):hover { border-color: color-mix(in srgb, var(--ac) 45%, transparent); }
    .rc-on { background: color-mix(in srgb, var(--ac) 10%, rgba(12,16,28,0.5)); border-color: color-mix(in srgb, var(--ac) 50%, transparent); }
    .rc-cur { opacity: 0.45; cursor: not-allowed; }
    .rc-ico { width: 22px; height: 22px; opacity: 0.7; }
    .rc-name { font-size: 12px; font-weight: 700; color: #dbe4f5; }
    .rc-tag { font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--ac); }

    .rc-panel { padding: 18px; border-left: 3px solid var(--ac); display: flex; flex-direction: column; gap: 18px; }
    .rc-head { display: flex; flex-direction: column; gap: 10px; }
    .rc-ovr { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .rc-ovr-cell { display: flex; flex-direction: column; gap: 3px; }
    .rc-ovr-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 30px; font-weight: 800; color: #94a3b8; line-height: 1; }
    .rc-ovr-to { color: var(--ac); }
    .rc-ovr-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .rc-arrow { font-size: 18px; color: #334155; }
    .rc-loss { margin-left: auto; display: flex; flex-direction: column; gap: 3px; align-items: flex-end; padding: 8px 12px; border-radius: 12px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.22); }
    .rc-loss-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 17px; font-weight: 800; color: #f87171; line-height: 1; }
    .rc-loss-l { font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #7f1d1d; }
    .rc-warn { font-size: 12px; color: #8ea0be; line-height: 1.7; max-width: 760px; }

    .rc-block { display: flex; flex-direction: column; }
    .rc-attrs { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    .rc-attr { display: flex; align-items: baseline; gap: 7px; padding: 7px 10px; border-radius: 9px; background: rgba(15,23,42,0.42); border: 1px solid rgba(51,65,85,0.2); font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11.5px; }
    .ra-k { font-weight: 800; color: var(--ac); width: 30px; flex-shrink: 0; }
    .ra-b { color: #64748b; }
    .ra-arrow { color: #334155; }
    .ra-a { font-weight: 800; color: #cbd5e1; }
    .ra-d { margin-left: auto; font-weight: 800; color: #f87171; }

    .rc-styles { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .rc-style { display: flex; flex-direction: column; gap: 5px; text-align: left; padding: 12px; border-radius: 12px; background: rgba(15,23,42,0.42); border: 1px solid rgba(51,65,85,0.24); font-family: inherit; cursor: pointer; }
    .rc-style:hover { border-color: rgba(139,92,246,0.35); }
    .rc-style.rc-on { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.42); }
    .rs-name { font-size: 12.5px; font-weight: 700; color: #dbe4f5; }
    .rs-blurb { font-size: 11px; color: #56688a; line-height: 1.55; }

    .rc-champs { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); max-height: 250px; overflow-y: auto; }
    .rc-champ { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 8px 10px; border-radius: 10px; background: rgba(15,23,42,0.42); border: 1px solid rgba(51,65,85,0.24); font-family: inherit; cursor: pointer; }
    .rc-champ:hover { border-color: rgba(139,92,246,0.35); }
    .rc-champ.rc-on { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.42); }
    .rch-n { font-size: 11.5px; font-weight: 700; color: #dbe4f5; }
    .rch-a { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #475569; }

    .rc-confirm { padding: 14px; border-radius: 14px; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.26); }
    .rcc-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; color: #fca5a5; }
    .rcc-p { font-size: 11.5px; color: #8ea0be; line-height: 1.7; margin: 7px 0 12px; max-width: 720px; }

    /* ============ RESPONSIVE ============ */
    @media (max-width: 560px) {
        .tf-h { font-size: 20px; }
        .off { padding: 14px; }
        .off-wage-v { font-size: 17px; }
        .rc-ovr-n { font-size: 26px; }
        .rc-loss { margin-left: 0; }
        .sc-int { width: 76px; }
        .b { padding: 8px 12px; font-size: 10.5px; }
    }
</style>
