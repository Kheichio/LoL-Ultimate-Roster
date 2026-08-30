<script>
    // ===================================================================
    //  LoL ULTIMATE CAREER - overlay host
    // ===================================================================
    //  One modal for everything that interrupts the career. CareerShell
    //  renders this whenever $careerOverlay is set; the store carries
    //  { kind, payload } and this file decides which body to show.
    //
    //  Three kinds demand an answer and cannot be walked away from:
    //  'event', 'interview' and 'retire'. Escape and the backdrop are
    //  inert for those until a choice has actually been made, because a
    //  decision the player dismissed is a decision the save never took.
    //
    //  Every body guards its payload. A malformed or missing payload
    //  renders a plain message and a close button instead of throwing -
    //  the modal is the last thing standing between the player and a
    //  blank screen, so it never gets to be the thing that breaks.

    import { onMount, onDestroy, tick } from 'svelte';

    import {
        career, careerScreen, careerOverlay, nextOverlay, clearOverlays,
        absWeek, saveCareer, flushCareer, resetCareer,
    } from '../../stores/career.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { openMenu } from '../../stores/menu.js';

    import {
        NEWS_TYPES, CLUB_TIERS, REGION_BY_ID, ROLE_BY_ID, teamById,
        ATTR_BY_KEY, TRAIT_RARITIES,
    } from '../../career/constants.js';
    import {
        fmtGold, fmtFollowers, fmtKDA, ordinal, statusInfo, ovrLabel,
    } from '../../career/ratings.js';
    import {
        applyEventOption, applyInterviewAnswer, describeEffect,
    } from '../../career/events.js';
    import { matchRatingLabel } from '../../career/match.js';
    import { acceptOffer, rejectOffer } from '../../career/contracts.js';
    import { canRetire, retire, careerSummary, legacyTier } from '../../career/awards.js';

    // ---------------------------------------------------------------
    //  local tables
    // ---------------------------------------------------------------
    const TONE = {
        humble:    { name: 'Humble',    color: '#22c55e' },
        confident: { name: 'Confident', color: '#3b82f6' },
        defiant:   { name: 'Defiant',   color: '#ef4444' },
        deflect:   { name: 'Deflect',   color: '#a78bfa' },
    };
    const TIER_COLOR = { legendary: '#f59e0b', major: '#a78bfa', minor: '#64748b' };
    const RARITY_COLOR = {
        common: '#94a3b8', uncommon: '#22c55e', rare: '#3b82f6', legendary: '#eab308',
    };
    const TIER_NAME  = { legendary: 'Legendary', major: 'Major', minor: 'Minor' };
    const SPLIT_NAME = { spring: 'Spring', summer: 'Summer' };
    const PURPLE = '#a78bfa';

    const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), '
        + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function num(v, d = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    }

    // ---------------------------------------------------------------
    //  local ui state
    // ---------------------------------------------------------------
    let panelEl = null;
    let prevFocus = null;
    let prevOverflow = '';

    let outcome = null;        // { text, applied, summary } after a choice
    let stage = 'ask';         // retire: 'ask' | 'done'
    let summary = null;        // retirement career summary
    let revealed = 0;          // awards revealed so far
    let revealTimer = null;
    let busy = false;

    let lastRef = null;

    $: kind = $careerOverlay ? String($careerOverlay.kind || '') : '';
    $: payload = $careerOverlay ? $careerOverlay.payload : null;

    // Re-arm whenever the store hands over a different overlay object.
    $: if ($careerOverlay !== lastRef) {
        lastRef = $careerOverlay;
        resetLocal($careerOverlay);
    }

    function resetLocal(cur) {
        stopReveal();
        outcome = null;
        summary = null;
        revealed = 0;
        busy = false;
        stage = 'ask';
        if (!cur) return;

        if (cur.kind === 'awards') {
            const list = Array.isArray(cur.payload) ? cur.payload.filter(Boolean) : [];
            startReveal(list.length);
        } else if (cur.kind === 'retire') {
            // Re-opening a career that already ended goes straight to the
            // retrospective; there is nothing left to confirm.
            let c = null;
            const un = career.subscribe(v => { c = v; }); un();
            if (c && c.flags && c.flags.retired) {
                summary = safeSummary(c);
                stage = 'done';
            }
        }
    }

    function safeSummary(c) {
        try {
            const s = careerSummary(c);
            if (s && typeof s === 'object') return s;
        } catch (e) { /* fall through to the null render */ }
        return null;
    }

    function startReveal(n) {
        stopReveal();
        revealed = n > 0 ? 1 : 0;
        if (n <= 1) return;
        revealTimer = setInterval(() => {
            revealed += 1;
            if (revealed >= n) stopReveal();
        }, 300);
    }

    function stopReveal() {
        if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
    }

    // ---------------------------------------------------------------
    //  validity + accent
    // ---------------------------------------------------------------
    function hasOptions(p) {
        return !!(p && typeof p === 'object' && Array.isArray(p.options) && p.options.length);
    }

    $: awardList = kind === 'awards' && Array.isArray(payload) ? payload.filter(Boolean) : [];

    $: valid = (() => {
        if (kind === 'event')     return hasOptions(payload) && !!(payload.title || payload.text);
        if (kind === 'interview') return hasOptions(payload) && !!payload.question;
        if (kind === 'result')    return !!(payload && typeof payload === 'object');
        if (kind === 'offer')     return !!(payload && typeof payload === 'object' && payload.id);
        if (kind === 'awards')    return awardList.length > 0;
        if (kind === 'season')    return !!(payload && typeof payload === 'object');
        if (kind === 'retire')    return true;
        if (kind === 'trait')     return !!(payload && typeof payload === 'object' && payload.trait && payload.trait.name);
        if (kind === 'breakthrough') return !!(payload && typeof payload === 'object' && Array.isArray(payload.attrs) && payload.attrs.length);
        return false;
    })();

    $: won = kind === 'result' && !!(payload && payload.won);

    $: accent = (() => {
        if (!valid) return '#64748b';
        if (kind === 'event') {
            const t = NEWS_TYPES[payload.type] || NEWS_TYPES.system;
            return t.accent;
        }
        if (kind === 'interview') return NEWS_TYPES.social.accent;
        if (kind === 'result')    return won ? '#22c55e' : '#ef4444';
        if (kind === 'offer')     return payload.teamAccent || PURPLE;
        if (kind === 'awards')    return TIER_COLOR[topTier(awardList)] || PURPLE;
        if (kind === 'retire')    return heroic ? '#f59e0b' : PURPLE;
        if (kind === 'trait')     return payload.trait.accent || RARITY_COLOR[payload.trait.rarity] || PURPLE;
        if (kind === 'breakthrough') return '#eab308';
        return PURPLE;
    })();

    // ---- trait reveal / breakthrough views -------------------------
    $: traitView = (kind === 'trait' && valid) ? (() => {
        const t = payload.trait;
        const rarity = TRAIT_RARITIES[t.rarity] || TRAIT_RARITIES.common;
        const before = Math.round(num(payload.potBefore, 0));
        const after = Math.round(num(payload.potAfter, before));
        const applied = payload.applied && typeof payload.applied === 'object' ? payload.applied : {};
        const rows = Object.keys(applied)
            .map(k => ({
                key: k,
                abbr: ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].abbr : String(k).toUpperCase(),
                color: ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].color : '#94a3b8',
                gained: Math.round(num(applied[k], 0)),
            }))
            .filter(r => r.gained > 0)
            .sort((a, b) => b.gained - a.gained);
        return {
            trait: t, rarity, before, after,
            moved: Math.max(0, after - before),
            age: Math.round(num(payload.age, 16)),
            rows,
        };
    })() : null;

    $: breakView = (kind === 'breakthrough' && valid) ? {
        points: Math.round(num(payload.points, 0)),
        potOVR: Math.round(num(payload.potOVR, 0)),
        attrs: payload.attrs
            .filter(a => a && typeof a === 'object')
            .map(a => ({
                abbr: String(a.abbr || a.key || '??').toUpperCase(),
                name: String(a.name || a.abbr || a.key || 'Attribute'),
                color: a.color || '#94a3b8',
                gained: Math.round(num(a.gained, 0)),
                ceiling: Math.round(num(a.ceiling, 0)),
            })),
    } : null;

    function topTier(list) {
        const order = { legendary: 2, major: 1, minor: 0 };
        let best = 'minor';
        for (const a of list) {
            const t = a && a.tier ? a.tier : 'minor';
            if ((order[t] || 0) > (order[best] || 0)) best = t;
        }
        return best;
    }

    // 'event', 'interview' and 'retire' hold the player until they answer.
    $: dismissible = !valid
        || (kind === 'event' || kind === 'interview' ? !!outcome
            : kind === 'retire' ? false
            : true);

    // ---------------------------------------------------------------
    //  focus trap + scroll lock
    // ---------------------------------------------------------------
    function focusables() {
        if (!panelEl) return [];
        return Array.from(panelEl.querySelectorAll(FOCUSABLE))
            .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
    }

    async function refocus() {
        await tick();
        const list = focusables();
        if (list.length) list[0].focus();
        else if (panelEl) panelEl.focus();
    }

    function onKeydown(e) {
        if (!$careerOverlay) return;
        if (e.key === 'Escape') {
            if (dismissible) { e.preventDefault(); close(); }
            return;
        }
        if (e.key !== 'Tab' || !panelEl) return;
        const list = focusables();
        if (!list.length) { e.preventDefault(); panelEl.focus(); return; }
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (!panelEl.contains(active)) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }

    onMount(() => {
        if (typeof document !== 'undefined') {
            prevFocus = document.activeElement;
            prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown, true);
        refocus();
    });

    onDestroy(() => {
        stopReveal();
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown, true);
        if (typeof document !== 'undefined') {
            document.body.style.overflow = prevOverflow;
            if (prevFocus && typeof prevFocus.focus === 'function') {
                try { prevFocus.focus(); } catch (e) { /* node is gone */ }
            }
        }
    });

    // ---------------------------------------------------------------
    //  actions
    // ---------------------------------------------------------------
    // One advance-week can raise several panels: a split close produces awards
    // or a season review, a birthday can reveal a genetic trait, and the weekly
    // random event lands last. nextOverlay() shows whatever is queued behind
    // this one and only clears the store when nothing is left -- before the
    // queue existed the last writer won and split awards were routinely thrown
    // away unseen.
    function close() {
        stopReveal();
        nextOverlay();
    }

    function dismiss() {
        playSound('click');
        close();
    }

    function onBackdrop() {
        if (dismissible) close();
    }

    function effectChips(applied) {
        const e = applied && typeof applied === 'object' ? applied : {};
        const out = [];
        const push = (key, v) => {
            const text = describeEffect(key, v);
            if (text) out.push({ text, up: num(v) > 0 });
        };
        for (const k of ['form', 'morale', 'energy', 'health', 'chemistry']) if (e[k]) push(k, e[k]);
        if (e.attr && typeof e.attr === 'object') {
            for (const k of Object.keys(e.attr)) if (e.attr[k]) push(k, e.attr[k]);
        }
        // One chip per language, exactly like the attr map above, rather than
        // describeEffect('language', map) -- that joins every language into a
        // single string, and one chip reading "Korean +5, English -2" cannot be
        // coloured up and down at the same time. A bare id falls through to
        // describeEffect's LANGUAGE_BY_ID arm and prints "Korean +5".
        if (e.language && typeof e.language === 'object') {
            for (const k of Object.keys(e.language)) if (e.language[k]) push(k, e.language[k]);
        }
        if (e.gold) push('gold', e.gold);
        if (e.followers) push('followers', e.followers);
        if (e.hype && e.hype !== e.followers) push('hype', e.hype);
        if (e.legacy) push('legacy', e.legacy);
        if (e.mmr) push('mmr', e.mmr);
        if (e.statusChange) {
            const text = describeEffect('statusChange', e.statusChange);
            if (text) out.push({ text, up: true });
        }
        return out;
    }

    function chooseEvent(opt) {
        if (busy || outcome) return;
        busy = true;
        let res = null;
        try { res = applyEventOption(payload, opt.id); } catch (e) { res = null; }
        busy = false;
        if (!res) {
            showToast('That choice could not be resolved.', 'error');
            close();
            return;
        }
        playSound('click');
        outcome = res;
        saveCareer();
        refocus();
    }

    function chooseAnswer(i) {
        if (busy || outcome) return;
        busy = true;
        let res = null;
        try { res = applyInterviewAnswer(payload, i); } catch (e) { res = null; }
        busy = false;
        if (!res) {
            showToast('The press moved on before you answered.', 'error');
            close();
            return;
        }
        playSound('click');
        outcome = res;
        saveCareer();
        refocus();
    }

    function doAccept() {
        if (busy) return;
        busy = true;
        let res = null;
        try { res = acceptOffer(payload.id); } catch (e) { res = null; }
        busy = false;
        if (res && res.ok) {
            saveCareer();
            close();
        } else {
            showToast((res && res.msg) || 'That offer is no longer on the table.', 'error');
            saveCareer();
            close();
        }
    }

    function doReject() {
        if (busy) return;
        busy = true;
        let res = null;
        try { res = rejectOffer(payload.id); } catch (e) { res = null; }
        busy = false;
        showToast((res && res.msg) || 'Offer turned down.', res && res.ok ? 'info' : 'error');
        saveCareer();
        close();
    }

    function doLater() {
        playSound('click');
        close();
        careerScreen.set('transfers');
    }

    function doRetire() {
        if (busy) return;
        const gate = retireGate;
        if (!gate.ok) { showToast(gate.reason, 'error'); return; }
        busy = true;
        let res = null;
        try { res = retire(); } catch (e) { res = null; }
        busy = false;
        if (!res) {
            showToast('Retirement could not be processed.', 'error');
            return;
        }
        if (res.blocked) {
            showToast(res.blocked, 'error');
            return;
        }
        summary = res;
        stage = 'done';
        saveCareer();
        refocus();
    }

    function toMenu() {
        playSound('click');
        stopReveal();
        // Leaving the mode drops the whole queue, not just the panel on top.
        clearOverlays();
        flushCareer();
        openMenu();
    }

    function newCareer() {
        playSound('click');
        stopReveal();
        resetCareer();
    }

    // ---------------------------------------------------------------
    //  derived per-kind views
    // ---------------------------------------------------------------
    $: retireGate = (() => {
        try {
            const g = canRetire($career);
            if (g && typeof g === 'object') return { ok: !!g.ok, reason: g.reason || '', forced: !!g.forced };
        } catch (e) { /* fall through */ }
        return { ok: false, reason: 'Retirement is not available right now.', forced: false };
    })();

    $: heroic = kind === 'retire'
        && (!!(summary && (summary.hallOfLegends || summary.inducted))
            || !!($career.flags && $career.flags.hallOfLegends));

    // --- result -------------------------------------------------------
    $: res = kind === 'result' && valid ? payload : null;
    $: resScore = res && Array.isArray(res.score) ? res.score : [0, 0];
    $: resKda = res && res.kda ? fmtKDA(num(res.kda.k), num(res.kda.d), num(res.kda.a)) : null;
    $: resRating = res ? Math.round(num(res.rating) * 10) / 10 : 0;
    $: resBand = res ? matchRatingLabel(resRating) : null;
    $: resPlayed = res ? res.played !== false : false;
    $: resRewards = res ? [
        { key: 'form',   label: 'Form',      v: num(res.formDelta),   fmt: 'plain' },
        { key: 'morale', label: 'Morale',    v: num(res.moraleDelta), fmt: 'plain' },
        { key: 'gold',   label: 'Gold',      v: num(res.goldDelta),   fmt: 'gold'  },
        { key: 'hype',   label: 'Followers', v: num(res.hypeDelta),   fmt: 'foll'  },
        { key: 'cp',     label: 'Champ Pts', v: num(res.champPoints), fmt: 'plain' },
    ].filter(r => r.v !== 0) : [];

    function signedNum(n) { return (n > 0 ? '+' : '') + Math.round(n); }
    function rewardText(r) {
        if (r.fmt === 'gold') return (r.v > 0 ? '+' : '-') + fmtGold(Math.abs(r.v));
        if (r.fmt === 'foll') return (r.v > 0 ? '+' : '-') + fmtFollowers(Math.abs(r.v));
        return signedNum(r.v);
    }

    // --- offer --------------------------------------------------------
    $: offer = kind === 'offer' && valid ? payload : null;
    $: offerTier = offer ? (CLUB_TIERS[offer.tier] || CLUB_TIERS[1]) : null;
    $: offerRegion = offer ? (REGION_BY_ID[offer.region] || null) : null;
    $: offerRole = offer ? (ROLE_BY_ID[offer.role] || null) : null;
    $: offerStatusInfo = offer ? statusInfo(offer.status) : null;
    $: offerWeeksLeft = offer && Number.isFinite(Number(offer.expiresWeek))
        ? Math.max(0, Math.round(num(offer.expiresWeek) - absWeek($career)))
        : null;
    $: offerTerms = offer ? [
        { label: 'Weekly Wage',   value: fmtGold(num(offer.salary)) + ' g', tone: 'gold' },
        { label: 'Length',        value: num(offer.years) === 1 ? '1 year' : num(offer.years) + ' years', tone: 'plain' },
        { label: 'Signing Bonus', value: num(offer.signingBonus) > 0 ? fmtGold(num(offer.signingBonus)) + ' g' : 'None', tone: 'plain' },
        { label: 'Squad Role',    value: offerStatusInfo ? offerStatusInfo.name : 'Substitute', tone: 'status' },
        { label: 'Release Clause', value: num(offer.releaseClause) > 0 ? fmtGold(num(offer.releaseClause)) + ' g' : 'None', tone: 'plain' },
        { label: 'Position',      value: offerRole ? offerRole.short : String(offer.role || '-'), tone: 'plain' },
    ] : [];

    // --- awards -------------------------------------------------------
    $: awardLegacy = awardList.reduce((s, a) => s + num(a.legacyPoints), 0);

    // --- season -------------------------------------------------------
    $: season = kind === 'season' && valid ? normSeason(payload) : null;

    function normSeason(p) {
        const o = p && typeof p === 'object' ? p : {};
        const rec = (o.record && typeof o.record === 'object') ? o.record : {};

        const year = Math.round(num(o.year, num($career.time.year)));
        const splitId = String(o.split || o.splitId || $career.season.split || 'spring');
        const w = Math.round(num(rec.w ?? rec.wins ?? o.wins ?? o.w));
        const l = Math.round(num(rec.l ?? rec.losses ?? o.losses ?? o.l));
        const place = Math.round(num(o.placement ?? o.place ?? o.rank ?? o.position ?? rec.placement, 0));
        const size = Math.round(num(o.teams ?? o.tableSize ?? o.leagueSize ?? o.fieldSize, 0));

        let placeLabel = typeof o.placementLabel === 'string' ? o.placementLabel : '';
        if (!placeLabel) {
            placeLabel = place > 0
                ? (size > 0 ? ordinal(place) + ' of ' + size : ordinal(place))
                : 'Unplaced';
        }

        const teamId = o.teamId || $career.player.clubId || null;
        const team = teamId ? teamById(teamId) : null;

        const rating = Math.round(num(o.avgRating ?? o.rating ?? o.averageRating ?? rec.rating) * 100) / 100;
        const games = Math.round(num(o.games ?? rec.games, w + l));

        const awards = Array.isArray(o.awards) ? o.awards.filter(Boolean) : [];

        const notes = [];
        const push = (label, text, tone) => {
            const t = typeof text === 'string' ? text.trim() : '';
            if (t) notes.push({ label, text: t, tone: tone || PURPLE });
        };

        if (Array.isArray(o.notes)) {
            for (const n of o.notes) {
                if (typeof n === 'string') push('Season', n, '#7c8fb0');
                else if (n && typeof n === 'object') push(n.label || 'Season', n.text || n.detail || '', n.accent);
            }
        }
        if (typeof o.headline === 'string') push('Verdict', o.headline, PURPLE);
        if (typeof o.summary === 'string') push('Verdict', o.summary, PURPLE);

        const contractNote = typeof o.contract === 'string' ? o.contract
            : typeof o.contractNote === 'string' ? o.contractNote
            : typeof o.contractChange === 'string' ? o.contractChange
            : '';
        push('Contract', contractNote, '#2dd4bf');

        const statusId = o.statusChange || o.newStatus || o.status;
        if (statusId && typeof statusId === 'string') {
            const si = statusInfo(statusId);
            push('Squad Role', 'The coach has you down as ' + si.name.toLowerCase() + ' next split.', si.accent);
        }
        if (o.released) push('Contract', 'Your club let you go. You are a free agent.', '#ef4444');
        if (o.promoted) push('Promotion', 'Promoted to the main roster.', '#22c55e');
        if (typeof o.transfer === 'string') push('Transfer', o.transfer, '#a855f7');

        return {
            year, splitId,
            splitName: SPLIT_NAME[splitId] || (splitId ? splitId.charAt(0).toUpperCase() + splitId.slice(1) : 'Split'),
            w, l, games, place, size, placeLabel, rating,
            teamName: o.teamName || (team ? team.name : 'Free Agent'),
            teamAccent: o.teamAccent || (team ? team.accent : '#64748b'),
            awards,
            notes,
        };
    }
</script>

<div class="co-over" style="--ac:{accent}">
    <!-- The backdrop is a click target, not a control: the close button and the
         Escape key are the real affordances, so it stays out of the tab order. -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="co-bg" class:co-bg-lock={!dismissible} on:click={onBackdrop}></div>

    <div
        class="co-panel"
        class:co-hero={heroic && stage === 'done'}
        bind:this={panelEl}
        role="dialog"
        aria-modal="true"
        aria-labelledby="co-title"
        tabindex="-1"
    >
        {#if !valid}
            <!-- =========== MALFORMED PAYLOAD =========== -->
            <header class="co-head">
                <span class="co-eyebrow">Career</span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>
            <div class="co-body">
                <h2 class="co-title" id="co-title">Nothing to show</h2>
                <p class="co-lede">
                    This screen was opened without anything to display{kind ? ' (' + kind + ')' : ''}.
                    Nothing has been changed in your save.
                </p>
                <div class="co-acts">
                    <button class="btn-secondary co-wide" on:click={dismiss}>Close</button>
                </div>
            </div>

        {:else if kind === 'event'}
            <!-- =========== LIFE EVENT =========== -->
            {@const nt = NEWS_TYPES[payload.type] || NEWS_TYPES.system}
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">{payload.icon || '\u{1F4CC}'}</span>
                    <span class="co-badge-t">{nt.label}</span>
                </span>
                {#if outcome}
                    <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
                {:else}
                    <span class="co-lockchip">Choose one</span>
                {/if}
            </header>

            <div class="co-body">
                <h2 class="co-title" id="co-title">{payload.title || 'Something happened'}</h2>

                {#if !outcome}
                    <p class="co-lede">{payload.text || ''}</p>
                    <p class="co-lbl">Your move</p>
                    <div class="co-opts">
                        {#each payload.options as opt, i (opt.id || i)}
                            <button class="co-opt" on:click={() => chooseEvent(opt)} disabled={busy}>
                                <span class="co-opt-main">
                                    <span class="co-opt-label">{opt.label || 'Option ' + (i + 1)}</span>
                                    {#if opt.desc}<span class="co-opt-desc">{opt.desc}</span>{/if}
                                </span>
                                <span class="co-opt-arrow" aria-hidden="true">&#x203A;</span>
                            </button>
                        {/each}
                    </div>
                {:else}
                    {@const chips = effectChips(outcome.applied)}
                    <div class="co-outcome">
                        <p class="co-lbl">What happened</p>
                        <p class="co-out-text">{outcome.text || 'It passed without much fuss.'}</p>
                        {#if chips.length}
                            <div class="co-chips">
                                {#each chips as ch, i (ch.text + i)}
                                    <span class="co-chip" class:co-up={ch.up} class:co-down={!ch.up}>{ch.text}</span>
                                {/each}
                            </div>
                        {:else}
                            <p class="co-none">{outcome.summary || 'No change'}</p>
                        {/if}
                    </div>
                    <div class="co-acts">
                        <button class="btn-primary co-wide" on:click={dismiss}>Continue</button>
                    </div>
                {/if}
            </div>

        {:else if kind === 'interview'}
            <!-- =========== PRESS CONFERENCE =========== -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F3A4;</span>
                    <span class="co-badge-t">Press Conference</span>
                </span>
                {#if outcome}
                    <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
                {:else}
                    <span class="co-lockchip">On the record</span>
                {/if}
            </header>

            <div class="co-body">
                {#if !outcome}
                    <p class="co-frame">
                        The room is four rows of cameras and a journalist with a phone on the table
                        between you. Everything you say next goes out with your name on it.
                    </p>
                    <h2 class="co-title co-q" id="co-title">{payload.question}</h2>
                    <p class="co-lbl">Your answer</p>
                    <div class="co-opts">
                        {#each payload.options as opt, i}
                            {@const tone = TONE[opt.tone] || TONE.humble}
                            <button
                                class="co-opt co-answer"
                                style="--tone:{tone.color}"
                                on:click={() => chooseAnswer(i)}
                                disabled={busy}
                            >
                                <span class="co-tone">{tone.name}</span>
                                <span class="co-opt-label co-quote">&ldquo;{opt.label}&rdquo;</span>
                            </button>
                        {/each}
                    </div>
                {:else}
                    {@const chips = effectChips(outcome.applied)}
                    <h2 class="co-title co-q" id="co-title">{payload.question}</h2>
                    <div class="co-outcome">
                        <p class="co-lbl">How it landed</p>
                        <p class="co-out-text">{outcome.text || ''}</p>
                        {#if chips.length}
                            <div class="co-chips">
                                {#each chips as ch, i (ch.text + i)}
                                    <span class="co-chip" class:co-up={ch.up} class:co-down={!ch.up}>{ch.text}</span>
                                {/each}
                            </div>
                        {:else}
                            <p class="co-none">{outcome.summary || 'No change'}</p>
                        {/if}
                    </div>
                    <div class="co-acts">
                        <button class="btn-primary co-wide" on:click={dismiss}>Continue</button>
                    </div>
                {/if}
            </div>

        {:else if kind === 'result'}
            <!-- =========== SIMULATED MATCH RESULT =========== -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F4FA;</span>
                    <span class="co-badge-t">{res.label || 'Match Result'}</span>
                </span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>

            <div class="co-body">
                <h2 class="co-title co-verdict" id="co-title">{won ? 'Win' : 'Defeat'}</h2>
                <p class="co-week">
                    Week {num(res.week, num($career.time.week))} &middot; {num(res.year, num($career.time.year))}
                </p>

                <div class="co-score">
                    <span class="co-team">{res.myTeamName || 'Your team'}</span>
                    <span class="co-score-n">{num(resScore[0])}<span class="co-dash">-</span>{num(resScore[1])}</span>
                    <span class="co-team co-team-r">{res.opponentName || 'Opponent'}</span>
                </div>

                {#if res.headline}
                    <p class="co-lede co-head-line">{res.headline}</p>
                {/if}

                {#if !resPlayed}
                    <div class="co-bench">
                        <span class="co-bench-t">You did not play</span>
                        <span class="co-bench-d">{res.benchReason || 'The coach went with somebody else this week.'}</span>
                    </div>
                {:else}
                    {#if res.mvp}
                        <div class="co-mvp">
                            <span class="co-mvp-ico" aria-hidden="true">&#x1F31F;</span>
                            <span class="co-mvp-t">Player of the Match</span>
                        </div>
                    {/if}
                    <div class="co-stats">
                        <div class="co-stat">
                            <span class="co-stat-v" style="color:{resBand.color}">{resRating.toFixed(1)}</span>
                            <span class="co-stat-l">Rating</span>
                            <span class="co-stat-s" style="color:{resBand.color}">{resBand.label}</span>
                        </div>
                        <div class="co-stat">
                            <span class="co-stat-v">{resKda ? resKda.line : '0/0/0'}</span>
                            <span class="co-stat-l">K / D / A</span>
                            <span class="co-stat-s">{resKda ? resKda.ratio.toFixed(2) + ' KDA' : ''}</span>
                        </div>
                        <div class="co-stat">
                            <span class="co-stat-v">{num(res.cs).toLocaleString()}</span>
                            <span class="co-stat-l">CS</span>
                            <span class="co-stat-s">{num(res.games && res.games.length, 1) > 0 ? Math.round(num(res.cs) / Math.max(1, num(res.games && res.games.length, 1))) + ' per game' : ''}</span>
                        </div>
                    </div>
                {/if}

                {#if resRewards.length}
                    <p class="co-lbl">What it moved</p>
                    <div class="co-chips">
                        {#each resRewards as r (r.key)}
                            <span class="co-chip" class:co-up={r.v > 0} class:co-down={r.v < 0}>
                                {r.label} {rewardText(r)}
                            </span>
                        {/each}
                    </div>
                {/if}

                <div class="co-acts">
                    <button class="btn-primary co-wide" on:click={dismiss}>Continue</button>
                </div>
            </div>

        {:else if kind === 'offer'}
            <!-- =========== CONTRACT OFFER =========== -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F4DD;</span>
                    <span class="co-badge-t">{offer.renewal ? 'Contract Renewal' : 'Contract Offer'}</span>
                </span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>

            <div class="co-body">
                <h2 class="co-title co-club" id="co-title">{offer.teamName || 'A club'}</h2>
                <div class="co-tags">
                    {#if offerTier}
                        <span class="co-tag" style="--t:{offerTier.accent}">{offerTier.name}</span>
                    {/if}
                    {#if offerRegion}
                        <span class="co-tag" style="--t:{offerRegion.accent}">
                            <span aria-hidden="true">{offerRegion.flag}</span> {offerRegion.league}
                        </span>
                    {/if}
                    {#if offerWeeksLeft !== null}
                        <span class="co-tag co-tag-mute">
                            {offerWeeksLeft === 0 ? 'Expires this week' : offerWeeksLeft + (offerWeeksLeft === 1 ? ' week left' : ' weeks left')}
                        </span>
                    {/if}
                </div>

                {#if offer.blurb}
                    <p class="co-lede">{offer.blurb}</p>
                {/if}

                {#if Number.isFinite(Number(offer.interest))}
                    <div class="co-interest">
                        <div class="co-int-top">
                            <span class="co-lbl co-flat">Club Interest</span>
                            <span class="co-int-n">{Math.round(num(offer.interest))}</span>
                        </div>
                        <div class="co-int-bar">
                            <div class="co-int-fill" style="width:{Math.max(0, Math.min(100, num(offer.interest)))}%"></div>
                        </div>
                    </div>
                {/if}

                <p class="co-lbl">Terms</p>
                <div class="co-terms">
                    {#each offerTerms as t (t.label)}
                        <div class="co-term">
                            <span class="co-term-l">{t.label}</span>
                            <span
                                class="co-term-v"
                                class:co-term-gold={t.tone === 'gold'}
                                style={t.tone === 'status' && offerStatusInfo ? 'color:' + offerStatusInfo.accent : ''}
                            >{t.value}</span>
                        </div>
                    {/each}
                </div>

                <div class="co-acts co-acts-col">
                    <button class="btn-success co-wide" on:click={doAccept} disabled={busy}>
                        Accept &mdash; sign for {offer.teamName || 'them'}
                    </button>
                    <div class="co-acts-row">
                        <button class="btn-secondary co-flex" on:click={doLater} disabled={busy}>Negotiate later</button>
                        <button class="btn-danger co-flex" on:click={doReject} disabled={busy}>Reject</button>
                    </div>
                    <p class="co-fine">
                        Negotiating later keeps the sheet on the table and takes you to the Transfers screen,
                        where you can haggle over wage, length and squad role.
                    </p>
                </div>
            </div>

        {:else if kind === 'awards'}
            <!-- =========== AWARDS =========== -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F3C6;</span>
                    <span class="co-badge-t">Honours</span>
                </span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>

            <div class="co-body">
                <h2 class="co-title" id="co-title">
                    {awardList.length === 1 ? 'An award' : awardList.length + ' awards'}
                </h2>
                <p class="co-lede">
                    The votes are in and the ceremony is over. This is what your name is on.
                </p>

                <div class="co-awards">
                    {#each awardList as a, i (a.id ? a.id + ':' + i : i)}
                        {@const tier = a.tier || 'minor'}
                        {@const col = TIER_COLOR[tier] || TIER_COLOR.minor}
                        {#if i < revealed}
                            <div class="co-award" style="--t:{col}">
                                <span class="co-aw-ico" aria-hidden="true">{a.icon || '\u{1F3C5}'}</span>
                                <span class="co-aw-main">
                                    <span class="co-aw-name">{a.name || a.id || 'Award'}</span>
                                    <span class="co-aw-meta">
                                        <span class="co-aw-tier">{TIER_NAME[tier] || 'Minor'}</span>
                                        {#if a.year}<span class="co-aw-dot">&middot;</span><span>{a.year}</span>{/if}
                                        {#if a.split}<span class="co-aw-dot">&middot;</span><span>{SPLIT_NAME[a.split] || a.split}</span>{/if}
                                        {#if a.teamId && teamById(a.teamId)}<span class="co-aw-dot">&middot;</span><span>{teamById(a.teamId).name}</span>{/if}
                                    </span>
                                    {#if a.desc}<span class="co-aw-desc">{a.desc}</span>{/if}
                                </span>
                                {#if num(a.legacyPoints) > 0}
                                    <span class="co-aw-lp">+{num(a.legacyPoints)}<span class="co-aw-lp-l">LP</span></span>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                </div>

                {#if awardLegacy > 0 && revealed >= awardList.length}
                    <p class="co-total">
                        <span class="co-total-n">+{awardLegacy}</span>
                        <span class="co-total-l">Legacy Points banked</span>
                    </p>
                {/if}

                <div class="co-acts">
                    <button class="btn-gold co-wide" on:click={dismiss}>Continue</button>
                </div>
            </div>

        {:else if kind === 'season'}
            <!-- =========== SEASON IN REVIEW =========== -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F4C5;</span>
                    <span class="co-badge-t">Season in Review</span>
                </span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>

            <div class="co-body">
                <h2 class="co-title" id="co-title">{season.year} {season.splitName}</h2>
                <p class="co-week" style="color:{season.teamAccent}">{season.teamName}</p>

                <div class="co-stats">
                    <div class="co-stat">
                        <span class="co-stat-v" style="color:{season.place === 1 ? '#f59e0b' : PURPLE}">
                            {season.place > 0 ? ordinal(season.place) : '\u2014'}
                        </span>
                        <span class="co-stat-l">Final Position</span>
                        <span class="co-stat-s">{season.placeLabel}</span>
                    </div>
                    <div class="co-stat">
                        <span class="co-stat-v">{season.w}<span class="co-dash">-</span>{season.l}</span>
                        <span class="co-stat-l">Record</span>
                        <span class="co-stat-s">
                            {(season.w + season.l) > 0 ? Math.round((season.w / (season.w + season.l)) * 100) + '% won' : 'No games'}
                        </span>
                    </div>
                    <div class="co-stat">
                        {#if season.rating > 0}
                            {@const band = matchRatingLabel(season.rating)}
                            <span class="co-stat-v" style="color:{band.color}">{season.rating.toFixed(2)}</span>
                            <span class="co-stat-l">Avg Rating</span>
                            <span class="co-stat-s" style="color:{band.color}">{band.label}</span>
                        {:else}
                            <span class="co-stat-v co-muted">&mdash;</span>
                            <span class="co-stat-l">Avg Rating</span>
                            <span class="co-stat-s">No games played</span>
                        {/if}
                    </div>
                </div>

                <p class="co-lbl">Awards</p>
                {#if season.awards.length}
                    <div class="co-awards">
                        {#each season.awards as a, i (a.id ? a.id + ':' + i : i)}
                            {@const col = TIER_COLOR[a.tier || 'minor'] || TIER_COLOR.minor}
                            <div class="co-award co-award-slim" style="--t:{col}">
                                <span class="co-aw-ico" aria-hidden="true">{a.icon || '\u{1F3C5}'}</span>
                                <span class="co-aw-main">
                                    <span class="co-aw-name">{a.name || a.id}</span>
                                    <span class="co-aw-meta"><span class="co-aw-tier">{TIER_NAME[a.tier || 'minor']}</span></span>
                                </span>
                                {#if num(a.legacyPoints) > 0}
                                    <span class="co-aw-lp">+{num(a.legacyPoints)}<span class="co-aw-lp-l">LP</span></span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <p class="co-empty">Nothing voted your way this split. Individual honours need eight games in the lineup and a table finish to argue from.</p>
                {/if}

                {#if season.notes.length}
                    <p class="co-lbl">What changed</p>
                    <div class="co-notes">
                        {#each season.notes as n, i (n.label + i)}
                            <div class="co-note" style="--t:{n.tone}">
                                <span class="co-note-l">{n.label}</span>
                                <span class="co-note-t">{n.text}</span>
                            </div>
                        {/each}
                    </div>
                {/if}

                <div class="co-acts">
                    <button class="btn-primary co-wide" on:click={dismiss}>Start the new season</button>
                </div>
            </div>

        {:else if kind === 'trait' && traitView}
            <!-- =========== GENETIC TRAIT REVEALED ===========
                 Fires once per career, on the birthday the start path names.
                 The whole point of it landing years in is that the player has
                 already invested a career by the time they see it. -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F9EC;</span>
                    <span class="co-badge-t">Something Shows Itself</span>
                </span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>

            <div class="co-body">
                <div class="co-trait" style="--t:{accent}">
                    <span class="co-trait-ico" aria-hidden="true">{traitView.trait.icon || '\u{2728}'}</span>
                    <span class="co-trait-rarity">{traitView.rarity.name}</span>
                    <h2 class="co-trait-name" id="co-title">{traitView.trait.name}</h2>
                </div>

                <p class="co-lede">{traitView.trait.blurb}</p>
                <p class="co-week">
                    You are {traitView.age}. Nobody could have told you this at thirteen, including you.
                </p>

                {#if traitView.moved > 0}
                    <div class="co-stats">
                        <div class="co-stat">
                            <span class="co-stat-v co-muted">{traitView.before}</span>
                            <span class="co-stat-l">Ceiling was</span>
                        </div>
                        <div class="co-stat">
                            <span class="co-stat-v" style="color:{accent}">{traitView.after}</span>
                            <span class="co-stat-l">Ceiling now</span>
                            <span class="co-stat-s" style="color:{accent}">+{traitView.moved} overall</span>
                        </div>
                    </div>
                {/if}

                {#if traitView.rows.length}
                    <p class="co-lbl">Where the room went</p>
                    <div class="co-chips">
                        {#each traitView.rows as r (r.key)}
                            <span class="co-chip" style="--t:{r.color}">{r.abbr} +{r.gained}</span>
                        {/each}
                    </div>
                {/if}

                <p class="co-empty">
                    The number is the ceiling, not the player. You still have to train every point of it.
                </p>

                <div class="co-acts">
                    <button class="btn-gold co-wide" on:click={dismiss}>Get back to work</button>
                </div>
            </div>

        {:else if kind === 'breakthrough' && breakView}
            <!-- =========== BREAKTHROUGH SPLIT ===========
                 The earned half of the ceiling. A split has to be genuinely
                 outstanding, and a whole career only has so much of it. -->
            <header class="co-head">
                <span class="co-badge">
                    <span class="co-badge-ico" aria-hidden="true">&#x1F4C8;</span>
                    <span class="co-badge-t">Breakthrough</span>
                </span>
                <button class="co-x" on:click={dismiss} aria-label="Close">&#x2715;</button>
            </header>

            <div class="co-body">
                <h2 class="co-title" id="co-title">Something clicked</h2>
                <p class="co-lede">
                    A split nobody can explain away. The staff go back through the VODs looking for what
                    changed and find that the answer is you.
                </p>

                <p class="co-lbl">Ceiling raised</p>
                <div class="co-awards">
                    {#each breakView.attrs as a, i (a.abbr + ':' + i)}
                        <div class="co-award co-award-slim" style="--t:{a.color}">
                            <span class="co-aw-ico" aria-hidden="true">{a.abbr}</span>
                            <span class="co-aw-main">
                                <span class="co-aw-name">{a.name}</span>
                                <span class="co-aw-meta"><span class="co-aw-tier">now caps at {a.ceiling}</span></span>
                            </span>
                            <span class="co-aw-lp">+{a.gained}</span>
                        </div>
                    {/each}
                </div>

                <p class="co-empty">
                    Most of it is already in your hands. The rest is training you can finally do again.
                </p>

                <div class="co-acts">
                    <button class="btn-gold co-wide" on:click={dismiss}>Continue</button>
                </div>
            </div>

        {:else}
            <!-- =========== RETIREMENT =========== -->
            {#if stage !== 'done'}
                <header class="co-head">
                    <span class="co-badge">
                        <span class="co-badge-ico" aria-hidden="true">&#x1F3AC;</span>
                        <span class="co-badge-t">Retirement</span>
                    </span>
                    <span class="co-lockchip">Decide</span>
                </header>

                <div class="co-body">
                    <h2 class="co-title" id="co-title">Hang it up?</h2>
                    <p class="co-lede">
                        Retiring ends this career permanently. The save stays as a record and you can read
                        the retrospective whenever you like, but you will never play another week with
                        {$career.player.handle || 'this player'} again. There is no undo and no way back.
                    </p>

                    <div class="co-warn" class:co-warn-ok={retireGate.ok}>
                        <span class="co-warn-ico" aria-hidden="true">{retireGate.ok ? '\u{26A0}' : '\u{1F512}'}</span>
                        <span class="co-warn-t">{retireGate.reason}</span>
                    </div>

                    {#if retireGate.forced}
                        <p class="co-fine">
                            You are past the age where a seat gets held for you. This is the last week of the career
                            either way.
                        </p>
                    {/if}

                    <div class="co-acts co-acts-col">
                        {#if retireGate.ok}
                            <button class="btn-danger co-wide" on:click={doRetire} disabled={busy}>
                                Retire &mdash; end the career for good
                            </button>
                        {/if}
                        <button class="btn-secondary co-wide" on:click={dismiss}>
                            {retireGate.ok ? 'Not yet \u2014 keep playing' : 'Back to the career'}
                        </button>
                    </div>
                </div>

            {:else if !summary}
                <header class="co-head">
                    <span class="co-badge">
                        <span class="co-badge-ico" aria-hidden="true">&#x1F3AC;</span>
                        <span class="co-badge-t">Retired</span>
                    </span>
                </header>
                <div class="co-body">
                    <h2 class="co-title" id="co-title">The career is over</h2>
                    <p class="co-lede">
                        The retrospective could not be assembled from this save, but the retirement itself went
                        through. Nothing else is coming.
                    </p>
                    <div class="co-acts co-acts-col">
                        <button class="btn-primary co-wide" on:click={toMenu}>Back to Main Menu</button>
                        <button class="btn-secondary co-wide" on:click={newCareer}>Start a New Career</button>
                    </div>
                </div>

            {:else}
                {@const tier = summary.legacyTier || legacyTier(num(summary.legacyScore))}
                <header class="co-head">
                    <span class="co-badge">
                        <span class="co-badge-ico" aria-hidden="true">&#x1F3AC;</span>
                        <span class="co-badge-t">Career Retrospective</span>
                    </span>
                </header>

                <div class="co-body">
                    {#if heroic}
                        <div class="co-hol">
                            <span class="co-hol-ico" aria-hidden="true">&#x1F3DB;</span>
                            <span class="co-hol-t">Inducted into the Hall of Legends</span>
                            <span class="co-hol-s">The last thing your name is ever attached to.</span>
                        </div>
                    {/if}

                    <h2 class="co-title" id="co-title">{summary.handle || 'Rookie'}</h2>
                    <p class="co-week">
                        {(ROLE_BY_ID[summary.role] || {}).name || summary.role}
                        &middot; {(REGION_BY_ID[summary.region] || {}).league || summary.region}
                        &middot; retired at {num(summary.age)}
                        &middot; {num(summary.years)} {num(summary.years) === 1 ? 'year' : 'years'}
                    </p>

                    <div class="co-legacy" style="--t:{tier.color}">
                        <span class="co-leg-n">{num(summary.legacyScore).toLocaleString()}</span>
                        <span class="co-leg-t">{tier.name}</span>
                        <span class="co-leg-b">{tier.blurb}</span>
                    </div>

                    <div class="co-stats">
                        <div class="co-stat">
                            <span class="co-stat-v">{num(summary.record && summary.record.games).toLocaleString()}</span>
                            <span class="co-stat-l">Games</span>
                            <span class="co-stat-s">
                                {num(summary.record && summary.record.w)}<span class="co-dash">-</span>{num(summary.record && summary.record.l)}
                                &middot; {num(summary.record && summary.record.winRate)}% won
                            </span>
                        </div>
                        <div class="co-stat">
                            <span class="co-stat-v">{(summary.kda && summary.kda.line) || '0/0/0'}</span>
                            <span class="co-stat-l">Career K / D / A</span>
                            <span class="co-stat-s">{num(summary.kda && summary.kda.ratio).toFixed(2)} KDA</span>
                        </div>
                        <div class="co-stat">
                            <span class="co-stat-v" style="color:{PURPLE}">{num(summary.peakOVR)}</span>
                            <span class="co-stat-l">Peak Overall</span>
                            <span class="co-stat-s">{ovrLabel(num(summary.peakOVR))}</span>
                        </div>
                    </div>

                    <div class="co-mini">
                        <div class="co-mini-c"><span class="co-mini-v">{summary.peakRank || 'Unranked'}</span><span class="co-mini-l">Peak Ladder</span></div>
                        <div class="co-mini-c"><span class="co-mini-v">{summary.earningsLabel || fmtGold(num(summary.totalEarnings))}</span><span class="co-mini-l">Earnings</span></div>
                        <div class="co-mini-c"><span class="co-mini-v">{summary.followersLabel || fmtFollowers(num(summary.followers))}</span><span class="co-mini-l">Followers</span></div>
                        <div class="co-mini-c"><span class="co-mini-v">{num(summary.titles && summary.titles.total)}</span><span class="co-mini-l">Major Titles</span></div>
                    </div>

                    <p class="co-lbl">Clubs</p>
                    {#if summary.teams && summary.teams.length}
                        <div class="co-clubs">
                            {#each summary.teams as t, i (t.teamId || i)}
                                {@const tm = teamById(t.teamId)}
                                <div class="co-club-row" style="--t:{tm ? tm.accent : '#64748b'}">
                                    <span class="co-club-n">{t.name}</span>
                                    <span class="co-club-y">{t.from}{t.to !== t.from ? '\u2013' + t.to : ''}</span>
                                    <span class="co-club-g">{num(t.games)} games</span>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="co-empty">Never held a professional contract. The whole career was played on the ladder.</p>
                    {/if}

                    {#if summary.titles && num(summary.titles.total) + num(summary.titles.worldsFinals) + num(summary.titles.poty) > 0}
                        <p class="co-lbl">Titles</p>
                        <div class="co-chips">
                            {#if num(summary.titles.worlds) > 0}<span class="co-chip co-gold">{num(summary.titles.worlds)}&times; World Champion</span>{/if}
                            {#if num(summary.titles.goldenRoad) > 0}<span class="co-chip co-gold">{num(summary.titles.goldenRoad)}&times; Golden Road</span>{/if}
                            {#if num(summary.titles.msi) > 0}<span class="co-chip co-gold">{num(summary.titles.msi)}&times; MSI</span>{/if}
                            {#if num(summary.titles.worldsFinals) > 0}<span class="co-chip">{num(summary.titles.worldsFinals)}&times; Worlds Finalist</span>{/if}
                            {#if num(summary.titles.regional) > 0}<span class="co-chip">{num(summary.titles.regional)}&times; Regional Title</span>{/if}
                            {#if num(summary.titles.poty) > 0}<span class="co-chip">{num(summary.titles.poty)}&times; Player of the Year</span>{/if}
                        </div>
                    {/if}

                    <p class="co-lbl">Awards</p>
                    {#if summary.awards && summary.awards.length}
                        <div class="co-awards">
                            {#each summary.awards as a, i (a.id || i)}
                                {@const col = TIER_COLOR[a.tier || 'minor'] || TIER_COLOR.minor}
                                <div class="co-award co-award-slim" style="--t:{col}">
                                    <span class="co-aw-ico" aria-hidden="true">{a.icon || '\u{1F3C5}'}</span>
                                    <span class="co-aw-main">
                                        <span class="co-aw-name">{a.name}</span>
                                        <span class="co-aw-meta"><span class="co-aw-tier">{TIER_NAME[a.tier || 'minor']}</span></span>
                                    </span>
                                    {#if num(a.count) > 1}<span class="co-aw-lp">&times;{num(a.count)}</span>{/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="co-empty">No individual honours. Plenty of careers end this way and still meant something to the people who watched them.</p>
                    {/if}

                    <p class="co-lbl">The verdict</p>
                    <p class="co-verdict-p">{summary.verdict || tier.blurb}</p>

                    <div class="co-acts co-acts-col">
                        <button class="btn-primary co-wide" on:click={toMenu}>Back to Main Menu</button>
                        <button class="btn-secondary co-wide" on:click={newCareer}>Start a New Career</button>
                    </div>
                </div>
            {/if}
        {/if}
    </div>
</div>

<style>
    /* ============ SHELL ============ */
    .co-over { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .co-bg {
        position: absolute; inset: 0; cursor: pointer;
        background: rgba(3, 6, 14, 0.82);
        backdrop-filter: blur(10px) saturate(120%); -webkit-backdrop-filter: blur(10px) saturate(120%);
        animation: coFade 0.2s ease both;
    }
    .co-bg-lock { cursor: default; }
    .co-panel {
        position: relative; display: flex; flex-direction: column; outline: none;
        width: 100%; max-width: 760px; max-height: 92vh; border-radius: 20px;
        background: linear-gradient(172deg, #0d1224 0%, #080d18 100%);
        border: 1px solid color-mix(in srgb, var(--ac) 26%, rgba(51, 65, 85, 0.4));
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.68), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
        animation: coRise 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .co-hero { border-color: rgba(245, 158, 11, 0.45); }

    @keyframes coFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes coRise { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
    @keyframes coPop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    /* ============ HEAD ============ */
    .co-head {
        flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 16px 20px; border-bottom: 1px solid rgba(51, 65, 85, 0.24);
    }
    .co-badge { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .co-badge-ico { font-size: 15px; line-height: 1; }
    .co-badge-t {
        font-size: 9.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ac);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .co-eyebrow { font-size: 9.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #3f5069; }
    .co-lockchip {
        flex-shrink: 0; font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
        padding: 4px 9px; border-radius: 6px; color: #64748b;
        background: rgba(30, 41, 59, 0.55); border: 1px solid rgba(51, 65, 85, 0.4);
    }
    .co-x {
        flex-shrink: 0; width: 30px; height: 30px; display: grid; place-items: center; cursor: pointer;
        border-radius: 9px; background: rgba(30, 41, 59, 0.55); border: 1px solid rgba(51, 65, 85, 0.4);
        color: #64748b; font-size: 12px; font-family: inherit;
    }
    .co-x:hover { color: #f87171; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.12); }
    .co-x:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; }

    /* ============ BODY TYPE ============ */
    .co-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 20px; }
    .co-title {
        margin: 0 0 6px; font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 26px; font-weight: 700; line-height: 1.15; letter-spacing: -0.015em;
        color: #e8eefb; overflow-wrap: anywhere;
    }
    .co-q { font-size: 21px; line-height: 1.3; }
    .co-verdict, .co-club { color: var(--ac); }
    .co-lede { margin: 0 0 16px; font-size: 13px; line-height: 1.7; color: #8296b6; overflow-wrap: anywhere; }
    .co-head-line { color: #7c8fb0; font-size: 12.5px; }
    .co-frame {
        margin: 0 0 14px; font-size: 11.5px; line-height: 1.7; color: #56688a; font-style: italic;
        padding-left: 12px; border-left: 2px solid rgba(236, 72, 153, 0.35);
    }
    .co-week { margin: 0 0 16px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; color: #56688a; }
    .co-lbl { margin: 20px 0 10px; font-size: 9.5px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #3f5069; }
    .co-lbl.co-flat { margin: 0; }
    .co-empty {
        margin: 0; font-size: 12px; line-height: 1.65; color: #52658a; padding: 13px 14px;
        border-radius: 12px; border: 1px dashed rgba(51, 65, 85, 0.42); background: rgba(15, 23, 42, 0.32);
    }
    .co-fine { margin: 4px 0 0; font-size: 10.5px; line-height: 1.65; color: #475569; }
    .co-muted { color: #475569; }

    /* ============ OPTION BUTTONS ============ */
    .co-opts { display: flex; flex-direction: column; gap: 9px; }
    .co-opt {
        display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 15px;
        border-radius: 13px; text-align: left; font-family: inherit; cursor: pointer;
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.36);
        transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
    }
    .co-opt:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--ac) 48%, transparent);
        background: rgba(20, 28, 48, 0.66); transform: translateX(2px);
    }
    .co-opt:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; }
    .co-opt:disabled { opacity: 0.5; cursor: default; }
    .co-opt-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
    .co-opt-label { font-size: 13.5px; font-weight: 700; color: #dbe4f5; line-height: 1.35; overflow-wrap: anywhere; }
    .co-opt-desc { font-size: 11.5px; line-height: 1.55; color: #5f7292; overflow-wrap: anywhere; }
    .co-opt-arrow { flex-shrink: 0; font-size: 17px; color: #334155; }
    .co-opt:hover:not(:disabled) .co-opt-arrow { color: var(--ac); }
    .co-answer { flex-direction: column; align-items: flex-start; gap: 8px; }
    .co-answer:hover:not(:disabled) { border-color: color-mix(in srgb, var(--tone) 52%, transparent); }
    .co-tone {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px; color: var(--tone);
        background: color-mix(in srgb, var(--tone) 13%, transparent);
        border: 1px solid color-mix(in srgb, var(--tone) 32%, transparent);
    }
    .co-quote { font-size: 14px; color: #e2e8f0; }

    /* ============ OUTCOME + CHIPS ============ */
    .co-outcome {
        padding: 16px; border-radius: 14px; background: rgba(15, 23, 42, 0.48);
        border: 1px solid color-mix(in srgb, var(--ac) 22%, rgba(51, 65, 85, 0.32));
        animation: coPop 0.3s ease both;
    }
    .co-outcome .co-lbl { margin-top: 0; }
    .co-out-text { margin: 0 0 12px; font-size: 13.5px; line-height: 1.72; color: #cbd5e1; overflow-wrap: anywhere; }
    .co-none { margin: 0; font-size: 11.5px; font-weight: 700; color: #475569; }
    .co-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .co-chip {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10.5px; font-weight: 700;
        padding: 5px 9px; border-radius: 7px; white-space: nowrap; color: #94a3b8;
        background: rgba(30, 41, 59, 0.55); border: 1px solid rgba(51, 65, 85, 0.4);
    }
    .co-chip.co-up { color: #4ade80; background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.28); }
    .co-chip.co-down { color: #f87171; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.28); }
    .co-chip.co-gold { color: #fbbf24; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); }

    /* ============ RESULT ============ */
    .co-score {
        display: flex; align-items: center; justify-content: center; gap: 14px;
        padding: 18px 12px; margin-bottom: 16px; border-radius: 14px;
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.3);
    }
    .co-team {
        flex: 1; min-width: 0; font-size: 12px; font-weight: 800; color: #7c8fb0; text-align: right;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .co-team-r { text-align: left; }
    .co-score-n {
        flex-shrink: 0; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 30px; font-weight: 800; line-height: 1; color: var(--ac);
    }
    .co-dash { color: #334155; padding: 0 5px; }
    .co-bench {
        display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 12px;
        background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .co-bench-t { font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #f87171; }
    .co-bench-d { font-size: 12px; line-height: 1.6; color: #7c8fb0; }
    .co-mvp {
        display: flex; align-items: center; gap: 9px; padding: 11px 14px; margin-bottom: 14px;
        border-radius: 11px; background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.32); animation: coPop 0.34s ease both;
    }
    .co-mvp-ico { font-size: 16px; }
    .co-mvp-t { font-size: 11px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: #fbbf24; }

    /* ============ STAT TILES ============ */
    .co-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .co-stat {
        display: flex; flex-direction: column; gap: 3px; padding: 14px 12px; border-radius: 13px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.28); min-width: 0;
    }
    .co-stat-v {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 20px; font-weight: 800;
        line-height: 1.1; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .co-stat-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }
    .co-stat-s { font-size: 10.5px; font-weight: 700; color: #56688a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ============ OFFER ============ */
    .co-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .co-tag {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 4px 9px; border-radius: 6px; color: var(--t);
        background: color-mix(in srgb, var(--t) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--t) 30%, transparent);
    }
    .co-tag-mute { color: #64748b; background: rgba(30, 41, 59, 0.55); border-color: rgba(51, 65, 85, 0.4); }
    .co-interest { margin-bottom: 4px; }
    .co-int-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
    .co-int-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; color: var(--ac); }
    .co-int-bar { height: 5px; border-radius: 4px; background: rgba(148, 163, 184, 0.12); overflow: hidden; }
    .co-int-fill { height: 100%; border-radius: 4px; background: var(--ac); transition: width 0.35s ease; }
    .co-terms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
    .co-term {
        display: flex; flex-direction: column; gap: 4px; padding: 12px 13px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.28); min-width: 0;
    }
    .co-term-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }
    .co-term-v {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; font-weight: 800;
        color: #dbe4f5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .co-term-gold { color: #fbbf24; }

    /* ============ AWARDS ============ */
    /* ---- trait reveal ---- */
    .co-trait {
        display: flex; flex-direction: column; align-items: center; gap: 7px;
        margin-bottom: 16px; padding: 22px 16px 18px; border-radius: 16px;
        background: color-mix(in srgb, var(--t) 8%, rgba(15, 23, 42, 0.5));
        border: 1px solid color-mix(in srgb, var(--t) 32%, transparent);
        animation: coPop 0.34s ease both;
    }
    .co-trait-ico { font-size: 40px; line-height: 1; }
    .co-trait-rarity {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 9.5px; font-weight: 700; letter-spacing: 2.2px; text-transform: uppercase;
        color: var(--t);
    }
    .co-trait-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 27px; font-weight: 700; letter-spacing: -0.01em;
        color: #e8eefb; margin: 0; text-align: center;
    }

    .co-awards { display: flex; flex-direction: column; gap: 9px; }
    .co-award {
        display: flex; align-items: center; gap: 13px; padding: 14px 15px; border-radius: 14px;
        background: color-mix(in srgb, var(--t) 7%, rgba(15, 23, 42, 0.5));
        border: 1px solid color-mix(in srgb, var(--t) 30%, transparent);
        animation: coPop 0.34s ease both;
    }
    .co-award-slim { padding: 11px 13px; }
    .co-aw-ico { flex-shrink: 0; font-size: 22px; line-height: 1; }
    .co-aw-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .co-aw-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14.5px; font-weight: 700;
        color: #e8eefb; line-height: 1.25; overflow-wrap: anywhere;
    }
    .co-aw-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; color: #56688a; }
    .co-aw-tier { font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--t); }
    .co-aw-dot { color: #2c3a52; }
    .co-aw-desc { font-size: 11px; line-height: 1.55; color: #52658a; margin-top: 2px; overflow-wrap: anywhere; }
    .co-aw-lp {
        flex-shrink: 0; display: flex; align-items: baseline; gap: 3px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 15px; font-weight: 800; color: var(--t);
    }
    .co-aw-lp-l { font-size: 8px; font-weight: 800; letter-spacing: 0.8px; color: #475569; }
    .co-total {
        display: flex; align-items: baseline; justify-content: center; gap: 8px;
        margin: 16px 0 0; padding: 13px; border-radius: 12px;
        background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25);
        animation: coPop 0.34s ease both;
    }
    .co-total-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 22px; font-weight: 800; color: #fbbf24; }
    .co-total-l { font-size: 9.5px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: #78716c; }

    /* ============ SEASON NOTES ============ */
    .co-notes { display: flex; flex-direction: column; gap: 8px; }
    .co-note {
        display: flex; flex-direction: column; gap: 4px; padding: 12px 13px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.28); border-left: 2px solid var(--t);
    }
    .co-note-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--t); }
    .co-note-t { font-size: 12px; line-height: 1.6; color: #8296b6; overflow-wrap: anywhere; }

    /* ============ RETIREMENT ============ */
    .co-warn {
        display: flex; align-items: flex-start; gap: 10px; padding: 13px 14px; border-radius: 12px;
        background: rgba(239, 68, 68, 0.07); border: 1px solid rgba(239, 68, 68, 0.24);
    }
    .co-warn-ok { background: rgba(139, 92, 246, 0.08); border-color: rgba(139, 92, 246, 0.28); }
    .co-warn-ico { flex-shrink: 0; font-size: 14px; line-height: 1.4; }
    .co-warn-t { font-size: 12px; line-height: 1.6; color: #a5b4cf; }
    .co-hol {
        display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center;
        padding: 18px 14px; margin-bottom: 18px; border-radius: 16px;
        background: radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.18), rgba(15, 23, 42, 0.5) 70%);
        border: 1px solid rgba(245, 158, 11, 0.4); animation: coPop 0.4s ease both;
    }
    .co-hol-ico { font-size: 30px; line-height: 1; }
    .co-hol-t { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; color: #fbbf24; }
    .co-hol-s { font-size: 11px; color: #78716c; }
    .co-legacy {
        display: flex; flex-direction: column; gap: 5px; padding: 16px; margin-bottom: 16px; border-radius: 14px;
        background: color-mix(in srgb, var(--t) 8%, rgba(15, 23, 42, 0.5));
        border: 1px solid color-mix(in srgb, var(--t) 32%, transparent);
    }
    .co-leg-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 30px; font-weight: 800; line-height: 1; color: var(--t); }
    .co-leg-t { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #e8eefb; }
    .co-leg-b { font-size: 11.5px; line-height: 1.6; color: #6a7d9d; }
    .co-mini { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .co-mini-c {
        display: flex; flex-direction: column; gap: 3px; padding: 11px 10px; border-radius: 11px;
        background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(51, 65, 85, 0.24); min-width: 0;
    }
    .co-mini-v {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800;
        color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .co-mini-l { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }
    .co-clubs { display: flex; flex-direction: column; gap: 6px; }
    .co-club-row {
        display: flex; align-items: baseline; gap: 10px; padding: 10px 13px; border-radius: 11px;
        background: rgba(15, 23, 42, 0.42); border: 1px solid rgba(51, 65, 85, 0.26); border-left: 2px solid var(--t);
    }
    .co-club-n { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; color: var(--t); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .co-club-y { flex-shrink: 0; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 700; color: #7c8fb0; }
    .co-club-g { flex-shrink: 0; font-size: 10px; font-weight: 700; color: #475569; }
    .co-verdict-p {
        margin: 0; font-size: 13px; line-height: 1.78; color: #a5b4cf; padding: 15px; border-radius: 13px;
        background: rgba(15, 23, 42, 0.42); border: 1px solid rgba(51, 65, 85, 0.28); overflow-wrap: anywhere;
    }

    /* ============ ACTIONS ============ */
    .co-acts { display: flex; gap: 10px; margin-top: 20px; }
    .co-acts-col { flex-direction: column; }
    .co-acts-row { display: flex; gap: 10px; }
    .co-wide { width: 100%; }
    .co-flex { flex: 1; }
    .co-acts button { font-family: inherit; }
    .co-acts button:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; }
    .co-acts button:disabled { opacity: 0.55; cursor: default; transform: none; }

    /* ============ RESPONSIVE ============ */
    @media (max-width: 620px) {
        .co-over { padding: 10px; }
        .co-panel { max-height: 94vh; border-radius: 16px; }
        .co-head { padding: 13px 15px; }
        .co-body { padding: 16px 15px; }
        .co-title { font-size: 22px; }
        .co-q { font-size: 18px; }
        .co-stats, .co-terms { grid-template-columns: 1fr; }
        .co-mini { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .co-score { gap: 10px; padding: 15px 10px; }
        .co-score-n { font-size: 25px; }
        .co-team { font-size: 11px; }
        .co-acts-row { flex-direction: column; }
    }
    @media (max-width: 380px) {
        .co-award { gap: 10px; padding: 12px; }
        .co-aw-ico { font-size: 19px; }
        .co-aw-name { font-size: 13px; }
        .co-club-row { flex-wrap: wrap; gap: 4px 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
        .co-panel, .co-bg, .co-award, .co-outcome, .co-mvp, .co-hol, .co-total { animation: none; }
        .co-opt:hover:not(:disabled) { transform: none; }
    }
</style>
