<script>
    // ═══════════════════════════════════════════════════════════════════
    //  CAREER -- GLOBAL BOARD ("Legends")
    // ═══════════════════════════════════════════════════════════════════
    //  Two views in one component: the ranked list, and one stranger's full
    //  dossier rendered inline underneath a back button.
    //
    //  THIS SCREEN NEVER WRITES A CAREER SAVE. None of the save, flush, init or
    //  reset entry points on the career store is imported here; the store is
    //  never set or updated; browser storage is only ever read. Whether you are
    //  published is DERIVED, by comparing the careerId on the row that came back
    //  from Firestore against the fingerprint of the save sitting in each slot,
    //  so there is no opt-in flag anywhere that could be written over a real
    //  career. The one time this codebase persisted a store it had not loaded it
    //  destroyed player saves; see CLAUDE.md, "Never persist a store that has
    //  not been loaded".
    //
    //  NO SIDE EFFECTS OUTSIDE onMount, and no timers at all. onMount does not
    //  run under SSR, which is why every loading / empty / offline / error
    //  state below is written in the MARKUP rather than assembled in script.
    //
    //  The four harness props (initialView / initialSort / previewRows /
    //  previewDossier) exist for tools/careerRender.mjs and nothing else. They
    //  are the Shop `initialTab` precedent: `view` is component-local, so
    //  without them the SSR harness could only ever compile the loading branch
    //  and the whole table would ship untested.

    import { onMount } from 'svelte';

    import CareerDossier from './CareerDossier.svelte';

    import {
        boardRows, boardState, myBoardRow,
        loadBoardPage, loadMyBoardRow, openDossier,
        publishCareerSlot, unpublishCareer, isSlotPublished,
    } from '../../stores/careerBoard.js';
    import {
        BOARD_SORTS, BOARD_LIMIT, sanitizeRow, remoteFiguresFrom,
    } from '../../career/board.js';
    import { careerSlotSummary } from '../../stores/career.js';
    import { currentUser } from '../../stores/auth.js';
    import { SLOT_IDS } from '../../utils/storage.js';
    import { ROLES, ROLE_BY_ID, REGIONS, REGION_BY_ID } from '../../career/constants.js';
    import { ovrTier, fmtRecord } from '../../career/ratings.js';
    import { legacyTier } from '../../career/awards.js';
    import { playSound } from '../../utils/sound.js';

    // ---- harness-only props ------------------------------------------
    export let initialView = 'list';
    export let initialSort = 'earnedScore';
    export let previewRows = null;
    export let previewDossier = null;

    // Built from code points so this file stays pure ASCII -- the card
    // database has been corrupted by an editor re-encoding emoji before.
    const MEDALS = { 1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}' };
    const ELL = String.fromCharCode(8230);

    // ---- view ---------------------------------------------------------
    let view = initialView === 'dossier' ? 'dossier' : 'list';
    let sort = BOARD_SORTS.some(s => s.key === initialSort) ? initialSort : BOARD_SORTS[0].key;

    // ---- board state, read defensively --------------------------------
    //  Every field is optional: a store that has not run yet, a store mid
    //  flight and a store that failed all have to render something sane.
    $: st = $boardState || {};
    $: loading = st.status === 'loading';
    // fetchedAt is stamped ONLY inside a successful read, so this is the one
    // honest "you have actually seen the board" signal. Never show a sync time
    // that an offline fallback invented.
    $: fetchedAt = Number(st.fetchedAt) || 0;
    $: hasSynced = fetchedAt > 0;
    // `typeof window !== 'undefined'` is NOT a sufficient guard here: the SSR
    // harness defines window and never defines fbDb. Read the handle itself,
    // and only from inside onMount -- the initial `false` is what lets the
    // harness compile the loaded and empty branches instead of this one.
    let noDb = false;
    $: offline = st.status === 'offline' || noDb;
    $: errorText = (st.status === 'error' && typeof st.error === 'string') ? st.error : '';
    // The tab the SCREEN is on. Deliberately local rather than read back off
    // boardState.sort: this component is the only caller of loadBoardPage, so
    // the two never disagree, and mirroring the store would let its default
    // overwrite the initialSort prop before the harness ever rendered a tab.
    $: activeSort = BOARD_SORTS.some(s => s.key === sort) ? sort : BOARD_SORTS[0].key;
    $: sortDef = BOARD_SORTS.find(s => s.key === activeSort) || BOARD_SORTS[0];

    // ---- rows ---------------------------------------------------------
    /** Every number the table dereferences without a guard. `earnedScore` and
     *  `boughtScore` get .toLocaleString() called straight on them, so a single
     *  null in any of these takes the WHOLE board down, not one row. */
    const ROW_NUMS = [
        'v', 'slot', 'age', 'years', 'ovr', 'peakOVR', 'peakMMR',
        'games', 'wins', 'losses', 'earnedScore', 'boughtScore',
        'titles', 'worlds', 'trophies', 'updatedAt',
    ];

    /** A board row is a Firestore document, i.e. hostile input. Anything that
     *  did not already come through sanitizeRow goes through it here, so the
     *  template can never dereference a missing field.
     *
     *  TWO STRING FIELDS ARE NOT PROOF OF A SANITISED ROW. The first cut of this
     *  took the fast path on `handle` and `teamName` alone, and a document
     *  carrying both as strings and a null earnedScore -- which is exactly what
     *  a row written by an older client, or by a client whose write was partly
     *  applied, looks like -- reached `.toLocaleString()` and threw inside the
     *  each block, blanking the entire screen. sanitizeRow() is cheap and
     *  idempotent; the fast path exists only to preserve `isMe`, so it has to
     *  be earned by every field the markup will actually read. */
    function normRow(raw, i) {
        const id = (raw && typeof raw === 'object' && raw.uid) || ('row-' + (i + 1));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return sanitizeRow(id, raw);
        if (typeof raw.handle !== 'string' || typeof raw.teamName !== 'string') return sanitizeRow(id, raw);
        for (const k of ROW_NUMS) if (!Number.isFinite(raw[k])) return sanitizeRow(id, raw);
        return raw;
    }

    /** Rank is fixed at LOAD time, off the server's own ordering. The filter
     *  chips below are client-side, so ranking the filtered list instead would
     *  invent positions the board does not actually hold. */
    function decorate(list, meUid) {
        const seen = Object.create(null);
        return (Array.isArray(list) ? list : []).map((raw, i) => {
            const r = normRow(raw, i);
            let uid = r.uid || ('row-' + (i + 1));
            if (seen[uid]) uid = uid + '-' + (i + 1);
            seen[uid] = true;

            const rl = ROLE_BY_ID[r.role] || ROLE_BY_ID.MID;
            const rg = REGION_BY_ID[r.region] || REGION_BY_ID.LEC;
            const decided = r.wins + r.losses;
            const lt = legacyTier(r.earnedScore);
            return {
                ...r,
                uid,
                rank: i + 1,
                medal: MEDALS[i + 1] || '',
                roleShort: rl.short,
                roleAccent: rl.accent,
                flag: rg.flag,
                league: rg.league,
                teamAccent: r.team ? r.team.accent : '#64748b',
                peakColor: ovrTier(r.peakOVR).color,
                record: fmtRecord(r.wins, r.losses),
                decided,
                winPct: decided > 0 ? Math.round((r.wins / decided) * 100) : 0,
                tierName: lt.name,
                tierColor: lt.color,
                fresh: shortAge(r.updatedAt),
                mine: r.isMe === true || (!!meUid && r.uid === meUid),
            };
        });
    }

    $: meUid = ($currentUser && typeof $currentUser.uid === 'string') ? $currentUser.uid : '';
    $: sourceRows = Array.isArray(previewRows) ? previewRows : ($boardRows || []);
    $: rows = decorate(sourceRows, meUid);

    // ---- filters (client-side, over the loaded page only) -------------
    let fRole = 'all';
    let fRegion = 'all';
    let fStatus = 'all';

    $: shownRows = rows.filter(r =>
        (fRole === 'all' || r.role === fRole)
        && (fRegion === 'all' || r.region === fRegion)
        && (fStatus === 'all' || (fStatus === 'retired' ? r.retired : !r.retired))
    );
    $: filtered = shownRows.length !== rows.length;

    function setFilter(kind, value) {
        playSound('click');
        if (kind === 'role') fRole = value;
        else if (kind === 'region') fRegion = value;
        else fStatus = value;
    }
    function clearFilters() {
        playSound('click');
        fRole = 'all'; fRegion = 'all'; fStatus = 'all';
    }

    // ---- time ---------------------------------------------------------
    function relTime(ms) {
        const t = Number(ms) || 0;
        if (t <= 0) return 'a moment ago';
        const mins = Math.floor(Math.max(0, Date.now() - t) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
        const days = Math.floor(hrs / 24);
        if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
        const months = Math.floor(days / 30);
        if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
        const years = Math.floor(months / 12);
        return years + (years === 1 ? ' year ago' : ' years ago');
    }

    function shortAge(ms) {
        const t = Number(ms) || 0;
        if (t <= 0) return 'new';
        const mins = Math.floor(Math.max(0, Date.now() - t) / 60000);
        if (mins < 60) return Math.max(1, mins) + 'm';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h';
        const days = Math.floor(hrs / 24);
        if (days < 365) return days + 'd';
        return Math.floor(days / 365) + 'y';
    }

    // ---- my entry -----------------------------------------------------
    //  Read from storage, never through the career store: careerSlotSummary
    //  and careerSlotRaw both go straight to the save file for one slot and
    //  neither switches the active slot or writes anything.
    let slotTick = 0;

    function readSlots(tick) {
        void tick;
        return SLOT_IDS.map(n => {
            let summary = null;
            try { summary = careerSlotSummary(n); } catch (e) { summary = null; }
            const rl = summary ? (ROLE_BY_ID[summary.role] || ROLE_BY_ID.MID) : null;
            const rg = summary ? (REGION_BY_ID[summary.region] || REGION_BY_ID.LEC) : null;
            return {
                n,
                summary,
                roleShort: rl ? rl.short : '',
                roleAccent: rl ? rl.accent : '#64748b',
                flag: rg ? rg.flag : '',
            };
        });
    }

    $: slots = readSlots(slotTick);
    $: publishedRow = $myBoardRow ? decorate([$myBoardRow], meUid)[0] : null;
    $: publishedId = publishedRow ? publishedRow.careerId : '';
    $: publishedSlot = publishedRow ? publishedRow.slot : 0;
    // "Which slot is on the board" is asked of isSlotPublished(), which compares
    // the published row's careerId against the fingerprint of the save on disk.
    // $myBoardRow is named here to make the whole map re-run when the row does;
    // the helper itself reads storage rather than any store.
    $: slotCards = slots.map(s => ({
        ...s,
        published: !!$myBoardRow && !!s.summary && (
            isSlotPublished(s.n)
            // A row carrying no careerId at all cannot be fingerprint-matched;
            // the slot it was published from is the only handle left.
            || (!publishedId && s.n === publishedSlot)
        ),
    }));
    $: signedIn = !!$currentUser;

    let busySlot = 0;
    let busyRemove = false;
    let confirmSlot = 0;
    let removeArmed = false;
    let notice = '';          // the last denial / failure, verbatim
    let noticeOk = false;

    $: busy = busySlot !== 0 || busyRemove;

    function messageOf(res, fallback) {
        if (typeof res === 'string') return res;
        if (res && typeof res === 'object') {
            if (typeof res.msg === 'string' && res.msg) return res.msg;
            if (typeof res.message === 'string' && res.message) return res.message;
            if (typeof res.reason === 'string' && res.reason) return res.reason;
            if (typeof res.error === 'string' && res.error) return res.error;
        }
        return fallback;
    }

    async function doPublish(n) {
        confirmSlot = 0;
        removeArmed = false;
        busySlot = n;
        notice = '';
        let res = null;
        try {
            // silent:false -- the store owns the success toast, this panel owns
            // the failure, which needs a recovery button a toast cannot carry.
            res = await publishCareerSlot(n, { silent: false });
        } catch (e) {
            res = { ok: false, msg: messageOf(e, 'The board refused the upload.') };
        }
        busySlot = 0;
        slotTick += 1;
        const failed = res && typeof res === 'object' && res.ok === false;
        if (failed) {
            noticeOk = false;
            notice = messageOf(res, 'The board refused the upload and nothing was published.');
        } else {
            noticeOk = true;
            notice = '';
        }
        refreshMine();
    }

    function askPublish(n) {
        playSound('click');
        notice = '';
        // Replacing somebody takes two clicks and names who is being replaced.
        if (publishedRow && !slotCards.some(s => s.n === n && s.published)) {
            confirmSlot = n;
            return;
        }
        doPublish(n);
    }

    async function doRemove() {
        playSound('click');
        removeArmed = false;
        confirmSlot = 0;
        busyRemove = true;
        notice = '';
        let res = null;
        try {
            res = await unpublishCareer();
        } catch (e) {
            res = { ok: false, msg: messageOf(e, 'The entry could not be removed.') };
        }
        busyRemove = false;
        slotTick += 1;
        if (res && typeof res === 'object' && res.ok === false) {
            noticeOk = false;
            notice = messageOf(res, 'The entry could not be removed. Your save is untouched either way.');
        }
        refreshMine();
    }

    /** The recovery offered after a denial: clear whatever is on the board
     *  under this account, then upload the slot again from scratch. */
    async function removeAndRepublish(n) {
        playSound('click');
        busySlot = n;
        try { await unpublishCareer(); } catch (e) { /* the publish reports */ }
        busySlot = 0;
        await doPublish(n);
    }

    function refreshMine() {
        try { loadMyBoardRow(); } catch (e) { /* the store owns its errors */ }
    }

    // ---- loading ------------------------------------------------------
    function loadPage(key, force) {
        try { loadBoardPage(key, { force: !!force }); } catch (e) { /* the store owns its errors */ }
    }

    /** A sort is a DISTINCT server-side query, never a client re-sort of the
     *  fifty rows already in hand -- re-ranking those would rank the wrong
     *  fifty for every column but the one the server ordered by. */
    function pickSort(key) {
        if (key === activeSort) return;
        playSound('click');
        sort = key;
        loadPage(key, false);
    }

    function refresh() {
        if (loading) return;
        playSound('click');
        loadPage(activeSort, true);
        refreshMine();
        slotTick += 1;
    }

    onMount(() => {
        noDb = !(typeof window !== 'undefined' && window.fbDb);
        // The harness drives this component through props and must not fire a
        // query; a real mount always does.
        if (Array.isArray(previewRows)) return;
        loadPage(activeSort, false);
        refreshMine();
    });

    // ---- dossier ------------------------------------------------------
    let dossierRow = Array.isArray(previewRows) && previewRows.length
        ? decorate(previewRows, '')[0]
        : null;
    let dossier = (previewDossier && previewDossier.player) ? previewDossier : null;
    let dossierLoading = false;
    let dossierError = '';

    // openDossier() resolves to a career-shaped object or null -- a corrupt or
    // missing document is a null it has already toasted about, never a throw.
    function careerFrom(res) {
        if (!res || typeof res !== 'object') return null;
        if (res.player) return res;
        if (res.career && res.career.player) return res.career;
        return null;
    }

    async function open(r) {
        playSound('click');
        dossierRow = r;
        dossier = null;
        dossierError = '';
        dossierLoading = true;
        view = 'dossier';
        if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0 });

        let res = null;
        try {
            res = await openDossier(r.uid);
        } catch (e) {
            res = { ok: false, msg: messageOf(e, '') };
        }
        dossierLoading = false;
        const c = careerFrom(res);
        if (c) dossier = c;
        else dossierError = messageOf(res, '');
    }

    function rowKey(e, r) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            open(r);
        }
    }

    function back() {
        playSound('click');
        view = 'list';
        dossier = null;
        dossierError = '';
        dossierLoading = false;
        if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0 });
    }
</script>

<section class="cb">
{#if view === 'dossier'}
    <!-- ══════════════════════ DOSSIER ══════════════════════
         Rendered inline rather than in a modal: it is a page-sized document
         and this screen is already 1360px wide. -->
    <div class="dv-head">
        <button class="b b-ghost" on:click={back}>&#8592; Back to the board</button>
        {#if dossierRow}
            <span class="dv-who">
                <span class="dv-flag" aria-hidden="true">{dossierRow.flag}</span>
                <span class="dv-h">{dossierRow.handle}</span>
                <span class="chip-role" style="--k:{dossierRow.roleAccent}">{dossierRow.roleShort}</span>
                <span class="dv-rank">Ranked #{dossierRow.rank} by {sortDef.label}</span>
            </span>
        {/if}
    </div>

    {#if dossier}
        <CareerDossier c={dossier} mine={false} remote={remoteFiguresFrom(dossierRow)} />
    {:else if dossierLoading}
        <div class="empty">
            <span class="empty-ico" aria-hidden="true">&#x1F4C4;</span>
            <p class="empty-t">Opening the record</p>
            <p class="empty-p">
                Downloading this player's full career: every season they played, the club they played it
                for, and the honours they took out of it. It is one document and it arrives in a second
                or two.
            </p>
        </div>
    {:else}
        <!-- The dossier failed, but the ranking row is already in hand and is
             the authority for every headline figure anyway. Show it, and say
             plainly what is missing. -->
        <div class="panel pad">
            <div class="slab">What we can still show you</div>
            {#if dossierRow}
                <div class="tiles">
                    <div class="tile">
                        <span class="t-v t-v-sm">{dossierRow.handle}</span>
                        <span class="t-l">Player</span>
                        <span class="t-s">{dossierRow.league} &#183; {dossierRow.roleShort}</span>
                    </div>
                    <div class="tile">
                        <span class="t-v t-v-sm">{dossierRow.teamName}</span>
                        <span class="t-l">Club</span>
                        <span class="t-s">age {dossierRow.age} &#183; {dossierRow.years} years pro</span>
                    </div>
                    <div class="tile" style="--k:{dossierRow.peakColor}">
                        <span class="t-v t-k">{dossierRow.peakOVR}</span>
                        <span class="t-l">Peak overall</span>
                        <span class="t-s">last seen at {dossierRow.ovr}</span>
                    </div>
                    <div class="tile">
                        <span class="t-v t-v-sm">{dossierRow.record}</span>
                        <span class="t-l">Record</span>
                        <span class="t-s">
                            {dossierRow.decided > 0 ? dossierRow.winPct + '% of decided games' : 'no decided games'}
                        </span>
                    </div>
                    <div class="tile" style="--k:#eab308">
                        <span class="t-v t-k">{dossierRow.titles}</span>
                        <span class="t-l">Titles</span>
                        <span class="t-s">{dossierRow.worlds} at Worlds</span>
                    </div>
                    <div class="tile" style="--k:{dossierRow.tierColor}">
                        <span class="t-v t-k">{dossierRow.earnedScore.toLocaleString()}</span>
                        <span class="t-l">Legacy earned</span>
                        <span class="t-s">{dossierRow.tierName}</span>
                    </div>
                </div>
            {/if}
            <div class="empty empty-sm">
                <p class="empty-t">The full record could not be loaded.</p>
                <p class="empty-p">
                    The figures above come from the ranking entry, which is already downloaded and is the
                    authority for every number on this board. The rest of the career &#8212; the attributes,
                    the club roster, the season-by-season history &#8212; lives in a second document, and that
                    one did not arrive.
                    {#if dossierError}
                        The service said: {dossierError}
                    {/if}
                    Go back and open the row again; nothing is cached and nothing on your own save was touched.
                </p>
                <button class="b b-go" on:click={() => open(dossierRow)} disabled={!dossierRow || dossierLoading}>
                    Try that record again
                </button>
            </div>
        </div>
    {/if}

{:else}
    <!-- ══════════════════════ HEADER ══════════════════════ -->
    <header class="hd">
        <div class="hd-txt">
            <h2 class="hd-h">Global Careers</h2>
            <p class="hd-p">
                Every entry on this board was published by the player who ran the career. The numbers are
                bounded and re-checked on the way in &#8212; they cannot be arbitrary &#8212; but they are not
                verified against a replay of the save, so read the board as a noticeboard rather than a
                record book. Ranking is on legacy <em>earned</em>: the monument ladder is purchasable and
                is shown beside the score, never counted into it.
            </p>
        </div>
        <div class="hd-act">
            <button class="b b-ghost" on:click={refresh} disabled={loading}>
                {loading ? 'Loading' + ELL : 'Refresh'}
            </button>
            {#if hasSynced}
                <span class="hd-sync">Last synced {relTime(fetchedAt)}</span>
            {/if}
        </div>
    </header>

    <!-- ══════════════════════ YOUR ENTRY ══════════════════════
         Rendered in every state, including signed out. A player who cannot
         publish still deserves to know why the board is asking nothing of
         them. -->
    <div class="panel pad mine">
        <div class="slab-row">
            <div class="slab">Your entry</div>
            {#if publishedRow}
                <span class="slab-ct">Published from slot {publishedRow.slot}</span>
            {/if}
        </div>

        {#if !signedIn}
            <p class="note">
                You are browsing signed out, which is the whole board: every career listed here is public
                and none of it needs an account to read. Publishing does &#8212; the board stores one career
                per account, so it needs to know whose it is. Sign in from the main menu and this panel
                turns into a list of your three career slots.
            </p>
        {:else}
            {#if publishedRow}
                <div class="pub" style="--k:{publishedRow.tierColor}">
                    <div class="pub-id">
                        <span class="pub-flag" aria-hidden="true">{publishedRow.flag}</span>
                        <span class="pub-h">{publishedRow.handle}</span>
                        <span class="chip-role" style="--k:{publishedRow.roleAccent}">{publishedRow.roleShort}</span>
                        {#if publishedRow.retired}
                            <span class="chip" style="--k:#ef4444">Retired</span>
                        {:else}
                            <span class="chip" style="--k:#22c55e">Active</span>
                        {/if}
                    </div>
                    <p class="pub-line">
                        {publishedRow.teamName} &#183; age {publishedRow.age} &#183;
                        {publishedRow.years} {publishedRow.years === 1 ? 'year' : 'years'} pro &#183;
                        peak {publishedRow.peakOVR} &#183; {publishedRow.record} &#183;
                        {publishedRow.earnedScore.toLocaleString()} legacy earned
                        {#if publishedRow.boughtScore > 0}
                            (+{publishedRow.boughtScore.toLocaleString()} endowed, not ranked)
                        {/if}
                    </p>
                    <p class="pub-sub">Last uploaded {relTime(publishedRow.updatedAt)}.</p>
                    <div class="pub-acts">
                        <button
                            class="b b-go"
                            on:click={() => doPublish(publishedRow.slot)}
                            disabled={busy}
                        >{busySlot === publishedRow.slot ? 'Uploading' + ELL : 'Republish from slot ' + publishedRow.slot}</button>
                        {#if removeArmed}
                            <span class="conf-q">Take it off the board?</span>
                            <button class="b b-danger" on:click={doRemove} disabled={busy}>Yes, remove it</button>
                            <button class="b b-ghost" on:click={() => (removeArmed = false)}>Keep it listed</button>
                        {:else}
                            <button
                                class="b b-warn"
                                on:click={() => { playSound('click'); removeArmed = true; }}
                                disabled={busy}
                            >Remove from the board</button>
                        {/if}
                    </div>
                    <p class="pub-note">
                        Republishing overwrites the entry with whatever that slot holds today. Removing it
                        deletes the public copy only &#8212; your save is never read for anything but a copy,
                        and nothing on this screen can write to it.
                    </p>
                </div>
            {:else}
                <p class="note">
                    Nothing of yours is on the board yet. Pick a slot below and it is uploaded as a copy:
                    a ranking entry and one document holding the career itself. One career per account, so
                    publishing a second slot replaces the first.
                </p>
            {/if}

            {#if notice && !noticeOk}
                <div class="deny">
                    <p class="deny-h">The board would not take that career</p>
                    <p class="deny-p">{notice}</p>
                    <p class="deny-p deny-sub">
                        Nothing was written to your save and nothing was removed from the board. A rejected
                        upload most often means a stale entry is already sitting under this account: clearing
                        it and uploading again from scratch fixes that.
                    </p>
                    <div class="pub-acts">
                        {#each slotCards.filter(s => !!s.summary) as s (s.n)}
                            <button
                                class="b b-warn"
                                on:click={() => removeAndRepublish(s.n)}
                                disabled={busy}
                            >Remove my entry and republish slot {s.n}</button>
                        {/each}
                        <button class="b b-ghost" on:click={() => (notice = '')}>Dismiss</button>
                    </div>
                </div>
            {/if}

            <div class="slots">
                {#each slotCards as s (s.n)}
                    <div class="slot" class:slot-on={s.published}>
                        <div class="slot-top">
                            <span class="slot-n">Slot {s.n}</span>
                            {#if s.published}<span class="chip" style="--k:#a78bfa">On the board</span>{/if}
                        </div>

                        {#if s.summary}
                            <span class="slot-h">{s.summary.handle}</span>
                            <span class="slot-m">
                                <span aria-hidden="true">{s.flag}</span>
                                <span class="chip-role" style="--k:{s.roleAccent}">{s.roleShort}</span>
                                {s.summary.team} &#183; age {s.summary.age} &#183; {s.summary.ovr} OVR
                            </span>
                            <span class="slot-m2">
                                {s.summary.year} season, week {s.summary.week}
                                &#183; {s.summary.trophies} {s.summary.trophies === 1 ? 'trophy' : 'trophies'}
                                {#if s.summary.retired}&#183; retired{/if}
                            </span>

                            {#if confirmSlot === s.n && publishedRow}
                                <div class="conf">
                                    <p class="conf-p">
                                        Only one career per account can be on the board. Publishing
                                        {s.summary.handle} takes {publishedRow.handle} off it, and the public
                                        copy of that career is deleted for good. Your slot {publishedRow.slot}
                                        save is not touched by any of this.
                                    </p>
                                    <div class="conf-acts">
                                        <button class="b b-danger" on:click={() => doPublish(s.n)} disabled={busy}>
                                            Replace {publishedRow.handle}
                                        </button>
                                        <button class="b b-ghost" on:click={() => (confirmSlot = 0)}>
                                            Keep {publishedRow.handle}
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <button
                                    class="b b-go slot-b"
                                    on:click={() => askPublish(s.n)}
                                    disabled={busy}
                                >
                                    {#if busySlot === s.n}
                                        Uploading{ELL}
                                    {:else if s.published}
                                        Republish this slot
                                    {:else}
                                        Publish this career
                                    {/if}
                                </button>
                            {/if}
                        {:else}
                            <p class="slot-none">No career in this slot.</p>
                            <p class="slot-none slot-none-sub">
                                Start one from the main menu and it can be published here the moment it has
                                a name.
                            </p>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- ══════════════════════ SORTS ══════════════════════
         Each tab is a separate server-side query, not a re-sort of the fifty
         rows already in hand. The roster board does the latter and silently
         ranks the wrong fifty for every column but one. -->
    <div class="bar">
        <div class="tabs" role="group" aria-label="Rank the board by">
            {#each BOARD_SORTS as s (s.key)}
                <button
                    class="fbtn"
                    class:fbtn-on={activeSort === s.key}
                    aria-pressed={activeSort === s.key}
                    title={s.hint}
                    disabled={loading}
                    on:click={() => pickSort(s.key)}
                >{s.label}</button>
            {/each}
        </div>
        <p class="bar-hint">{sortDef.hint} Each tab is its own query for the top {BOARD_LIMIT}.</p>
    </div>

    <!-- ══════════════════════ FILTERS ══════════════════════ -->
    <div class="filt">
        <div class="filt-row">
            <span class="filt-l">Role</span>
            <button class="fbtn fbtn-sm" class:fbtn-on={fRole === 'all'} on:click={() => setFilter('role', 'all')}>All</button>
            {#each ROLES as r (r.id)}
                <button
                    class="fbtn fbtn-sm"
                    class:fbtn-on={fRole === r.id}
                    on:click={() => setFilter('role', r.id)}
                >{r.short}</button>
            {/each}
        </div>
        <div class="filt-row">
            <span class="filt-l">Region</span>
            <button class="fbtn fbtn-sm" class:fbtn-on={fRegion === 'all'} on:click={() => setFilter('region', 'all')}>All</button>
            {#each REGIONS as r (r.id)}
                <button
                    class="fbtn fbtn-sm"
                    class:fbtn-on={fRegion === r.id}
                    on:click={() => setFilter('region', r.id)}
                ><span aria-hidden="true">{r.flag}</span> {r.league}</button>
            {/each}
        </div>
        <div class="filt-row">
            <span class="filt-l">Status</span>
            {#each [['all', 'Any'], ['active', 'Still playing'], ['retired', 'Retired']] as [id, label] (id)}
                <button
                    class="fbtn fbtn-sm"
                    class:fbtn-on={fStatus === id}
                    on:click={() => setFilter('status', id)}
                >{label}</button>
            {/each}
            {#if filtered}
                <button class="fbtn fbtn-sm fbtn-clear" on:click={clearFilters}>Clear filters</button>
            {/if}
        </div>
        <p class="filt-note">
            Filters apply to the {rows.length} {rows.length === 1 ? 'row' : 'rows'} loaded, not to the whole
            board. Filtering on the server would need a composite index built by hand, so the sort tabs are
            what fetch a different set of careers.
        </p>
    </div>

    <!-- ══════════════════════ TABLE / STATES ══════════════════════ -->
    <div class="panel pad">
        {#if rows.length > 0}
            {#if shownRows.length > 0}
                <div class="tbl-wrap">
                    <table class="tbl">
                        <thead>
                            <tr>
                                <th scope="col">Rank</th>
                                <th scope="col">Player</th>
                                <th scope="col">Club</th>
                                <th scope="col">Age / Yrs</th>
                                <th scope="col">Peak</th>
                                <th scope="col">Record</th>
                                <th scope="col">Titles</th>
                                <th scope="col">Legacy</th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each shownRows as r (r.uid)}
                                <tr
                                    class="rw"
                                    class:rw-me={r.mine}
                                    role="button"
                                    tabindex="0"
                                    aria-label="Open the career dossier for {r.handle}"
                                    on:click={() => open(r)}
                                    on:keydown={(e) => rowKey(e, r)}
                                >
                                    <td class="td-rank">
                                        {#if r.medal}
                                            <span class="medal" aria-hidden="true">{r.medal}</span>
                                        {/if}
                                        <span class="rank-n">{r.rank}</span>
                                    </td>

                                    <td class="td-p">
                                        <span class="p-top">
                                            <span class="p-flag" aria-hidden="true">{r.flag}</span>
                                            <span class="p-h">{r.handle}</span>
                                            <span class="chip-role" style="--k:{r.roleAccent}">{r.roleShort}</span>
                                            {#if r.mine}<span class="chip chip-me" style="--k:#a78bfa">(You)</span>{/if}
                                            {#if r.hallOfLegends}
                                                <span class="chip" style="--k:#eab308">Hall of Legends</span>
                                            {/if}
                                        </span>
                                        <span class="p-dn">
                                            {r.displayName ? r.displayName : 'Account name not set'}
                                        </span>
                                    </td>

                                    <td class="td-club">
                                        <span class="cl">
                                            <span class="cl-dot" style="background:{r.teamAccent}" aria-hidden="true"></span>
                                            <span class="cl-n" title={r.teamName}>{r.teamName}</span>
                                        </span>
                                    </td>

                                    <td class="td-mono">
                                        {r.age}
                                        <span class="td-sub">{r.years}y pro</span>
                                    </td>

                                    <td class="td-mono">
                                        <span class="pk" style="color:{r.peakColor}">{r.peakOVR}</span>
                                        <span class="td-sub">now {r.ovr}</span>
                                    </td>

                                    <td class="td-mono">
                                        {r.record}
                                        <span class="td-sub">
                                            {r.decided > 0 ? r.winPct + '% won' : 'no decided games'}
                                        </span>
                                    </td>

                                    <td class="td-mono">
                                        {r.titles}
                                        <span class="td-sub">
                                            {r.worlds > 0 ? r.worlds + ' at Worlds' : 'no Worlds title'}
                                        </span>
                                    </td>

                                    <td class="td-leg">
                                        <span class="leg-v">{r.earnedScore.toLocaleString()}</span>
                                        <span class="chip" style="--k:{r.tierColor}">{r.tierName}</span>
                                        {#if r.boughtScore > 0}
                                            <span class="td-sub">+{r.boughtScore.toLocaleString()} endowed</span>
                                        {/if}
                                    </td>

                                    <td class="td-st">
                                        {#if r.retired}
                                            <span class="chip" style="--k:#ef4444">Retired</span>
                                        {:else}
                                            <span class="chip" style="--k:#22c55e">Playing</span>
                                        {/if}
                                        <span class="td-sub">{r.fresh} old</span>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <p class="foot">
                    Showing {shownRows.length} of {rows.length} loaded
                    {rows.length === 1 ? 'career' : 'careers'}, ranked by {sortDef.label}.
                    The board returns the top {BOARD_LIMIT} for each sort. Open any row for the full dossier.
                </p>
            {:else}
                <div class="empty">
                    <span class="empty-ico" aria-hidden="true">&#x1F50D;</span>
                    <p class="empty-t">No loaded career matches those filters.</p>
                    <p class="empty-p">
                        The filters run over the {rows.length} rows already downloaded for this sort, not over
                        the whole board, so a region with nobody in the top {BOARD_LIMIT} looks empty even
                        when careers exist there. Clear a chip to widen it, or pick a different sort to pull
                        down a different fifty.
                    </p>
                    <button class="b b-ghost" on:click={clearFilters}>Clear filters</button>
                </div>
            {/if}

        {:else if loading}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F30D;</span>
                <p class="empty-t">Reading the board</p>
                <p class="empty-p">
                    Fetching the top {BOARD_LIMIT} careers for this sort. It is a single query and it
                    usually lands in under a second. Nothing of yours is uploaded by looking, and your own
                    save is not read while the board loads.
                </p>
            </div>

        {:else if offline}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F50C;</span>
                <p class="empty-t">The board is offline</p>
                <p class="empty-p">
                    This browser cannot reach the leaderboard service, so there is nothing to list. That is
                    the only thing affected: every other part of career mode runs entirely on this device,
                    so training, matches, transfers, the shop and your save all work exactly as they did,
                    and nothing local has changed. Come back when you have a connection and hit Refresh.
                </p>
            </div>

        {:else if errorText}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x26A0;</span>
                <p class="empty-t">The board did not load</p>
                <p class="empty-p">
                    The service answered with an error: {errorText}
                    Nothing was written and nothing of yours was published or removed &#8212; a failed read
                    changes neither the board nor your career. Refresh to try the same query again, or pick
                    another sort.
                </p>
                <button class="b b-ghost" on:click={refresh} disabled={loading}>Refresh the board</button>
            </div>

        {:else}
            <div class="empty">
                <span class="empty-ico" aria-hidden="true">&#x1F3DC;</span>
                <p class="empty-t">Nobody has published a career yet</p>
                <p class="empty-p">
                    The board answered and it is empty: not one career has been uploaded under this sort.
                    Publish one of yours from the panel above and it becomes the first entry every other
                    player sees when they open this screen. A career does not have to be finished to be
                    listed &#8212; retired ones simply also appear under Completed.
                </p>
            </div>
        {/if}
    </div>
{/if}
</section>

<style>
    .cb { display: flex; flex-direction: column; gap: 18px; max-width: 1360px; margin: 0 auto; width: 100%; }

    /* ---------- shared shell (matches Profile / Transfers) ---------- */
    .panel { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.32); border-radius: 18px; }
    .pad { padding: 20px; }
    .slab { font-size: 9.5px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #3f5069; margin-bottom: 12px; }
    .slab-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .slab-ct { font-size: 10px; font-weight: 700; letter-spacing: 0.4px; color: #4a5b76; margin-bottom: 12px; }
    .note { font-size: 11.5px; line-height: 1.7; color: #56688a; margin: 0 0 14px; max-width: 780px; }

    .chip {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px; white-space: nowrap; color: var(--k, #64748b);
        background: color-mix(in srgb, var(--k, #64748b) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--k, #64748b) 28%, transparent);
    }
    .chip-role {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px; white-space: nowrap; color: var(--k, #64748b);
        background: color-mix(in srgb, var(--k, #64748b) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--k, #64748b) 28%, transparent);
    }
    .chip-me { letter-spacing: 0.6px; }

    /* ---------- buttons ---------- */
    .b {
        padding: 8px 15px; border-radius: 10px; border: 1px solid transparent; font-family: inherit;
        font-size: 11px; font-weight: 800; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap;
        transition: transform 0.12s ease, background 0.12s ease, color 0.12s ease;
    }
    .b:disabled { opacity: 0.45; cursor: not-allowed; }
    .b:not(:disabled):hover { transform: translateY(-1px); }
    .b-ghost { background: rgba(51,65,85,0.3); color: #7f92b3; border-color: rgba(71,85,105,0.3); }
    .b-ghost:not(:disabled):hover { background: rgba(71,85,105,0.45); color: #e2e8f0; }
    .b-go { background: rgba(139,92,246,0.14); color: #c4b5fd; border-color: rgba(139,92,246,0.34); }
    .b-go:not(:disabled):hover { background: rgba(139,92,246,0.24); color: #ede9fe; }
    .b-warn { background: rgba(239,68,68,0.1); color: #fca5a5; border-color: rgba(239,68,68,0.28); }
    .b-warn:not(:disabled):hover { background: rgba(239,68,68,0.2); }
    .b-danger { background: linear-gradient(135deg, #dc2626, #ef4444); color: #fff; }

    /* ---------- header ---------- */
    .hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
    .hd-txt { min-width: 0; flex: 1; }
    .hd-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 24px; font-weight: 800; color: #e8eefb; letter-spacing: -0.02em; margin: 0;
    }
    .hd-p { font-size: 11.5px; line-height: 1.7; color: #56688a; margin: 8px 0 0; max-width: 860px; }
    .hd-p em { color: #a78bfa; font-style: normal; font-weight: 700; }
    .hd-act { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
    .hd-sync { font-size: 9.5px; font-weight: 700; letter-spacing: 0.5px; color: #3f5069; }

    /* ---------- your entry ---------- */
    .mine { border-color: rgba(139,92,246,0.22); }
    .pub {
        display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 14px;
        margin-bottom: 14px;
        background: color-mix(in srgb, var(--k, #a78bfa) 7%, rgba(15,23,42,0.5));
        border: 1px solid color-mix(in srgb, var(--k, #a78bfa) 26%, transparent);
    }
    .pub-id { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
    .pub-flag { font-size: 15px; line-height: 1; }
    .pub-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; font-weight: 700; color: #e8eefb; }
    .pub-line { font-size: 11.5px; line-height: 1.6; color: #8ea0be; margin: 0; }
    .pub-sub { font-size: 10px; font-weight: 700; color: #475569; margin: 0; }
    .pub-acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .pub-note { font-size: 10.5px; line-height: 1.6; color: #475569; margin: 8px 0 0; max-width: 720px; }

    .deny {
        padding: 13px 15px; border-radius: 12px; margin-bottom: 14px;
        background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.26);
    }
    .deny-h { font-size: 12.5px; font-weight: 800; color: #fca5a5; margin: 0 0 6px; }
    .deny-p { font-size: 11.5px; line-height: 1.65; color: #8ea0be; margin: 0; max-width: 760px; }
    .deny-sub { color: #56688a; margin-top: 6px; font-size: 11px; }

    .slots { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .slot {
        display: flex; flex-direction: column; gap: 5px; padding: 13px 14px; border-radius: 13px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.28); min-width: 0;
    }
    .slot-on { background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.34); }
    .slot-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .slot-n { font-size: 8.5px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: #3f5069; }
    .slot-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700;
        color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .slot-m { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10.5px; font-weight: 600; color: #64769a; }
    .slot-m2 { font-size: 10px; font-weight: 600; color: #46587a; }
    .slot-b { margin-top: 7px; align-self: flex-start; }
    .slot-none { font-size: 11.5px; line-height: 1.6; color: #4a5b76; margin: 2px 0 0; font-style: italic; }
    .slot-none-sub { font-size: 10.5px; color: #3f5069; font-style: normal; }

    .conf { margin-top: 8px; padding: 11px 12px; border-radius: 11px; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.24); }
    .conf-p { font-size: 11px; line-height: 1.6; color: #8ea0be; margin: 0 0 9px; }
    .conf-q { font-size: 11px; font-weight: 700; color: #fca5a5; }
    .conf-acts { display: flex; gap: 8px; flex-wrap: wrap; }

    /* ---------- sorts ---------- */
    .bar { display: flex; flex-direction: column; gap: 8px; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .fbtn {
        padding: 7px 14px; border-radius: 9px; border: 1px solid rgba(51,65,85,0.32);
        background: rgba(15,23,42,0.5); font-family: inherit; font-size: 11px; font-weight: 800;
        color: #64748b; cursor: pointer; white-space: nowrap;
    }
    .fbtn:not(:disabled):hover { color: #cbd5e1; border-color: rgba(71,85,105,0.6); }
    .fbtn:disabled { opacity: 0.5; cursor: not-allowed; }
    .fbtn-on { color: #c4b5fd; background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.34); }
    .fbtn-sm { padding: 5px 10px; font-size: 10px; font-weight: 700; }
    .fbtn-clear { color: #fca5a5; border-color: rgba(239,68,68,0.26); }
    .bar-hint { font-size: 11px; line-height: 1.6; color: #46587a; margin: 0; max-width: 820px; }

    /* ---------- filters ---------- */
    .filt { display: flex; flex-direction: column; gap: 7px; }
    .filt-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .filt-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #334155; min-width: 48px; }
    .filt-note { font-size: 10.5px; line-height: 1.6; color: #3f5069; margin: 2px 0 0; max-width: 820px; }

    /* ---------- table ---------- */
    .tbl-wrap { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
    .tbl { width: 100%; border-collapse: collapse; min-width: 940px; }
    .tbl th {
        text-align: left; font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
        color: #334155; padding: 0 12px 8px 0; white-space: nowrap;
    }
    .tbl td {
        padding: 10px 12px 10px 0; font-size: 12px; font-weight: 600; color: #94a3b8;
        border-top: 1px solid rgba(51,65,85,0.2); vertical-align: middle;
    }
    .rw { cursor: pointer; transition: background 0.12s ease; }
    .rw:hover { background: rgba(139,92,246,0.06); }
    .rw:focus-visible { outline: 2px solid rgba(139,92,246,0.55); outline-offset: -2px; }
    .rw-me td { background: rgba(139,92,246,0.07); }
    .rw-me td:first-child { box-shadow: inset 2px 0 0 #a78bfa; }

    .td-rank { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .medal { font-size: 14px; line-height: 1; }
    .rank-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: #4a5b76; }

    .td-p { min-width: 0; }
    .p-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .p-flag { font-size: 13px; line-height: 1; }
    .p-h { font-size: 13.5px; font-weight: 800; color: #e2e8f0; }
    .p-dn {
        display: block; margin-top: 3px; font-size: 10px; font-weight: 600; color: #46587a;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px;
    }

    .td-club { max-width: 190px; }
    .cl { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .cl-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .cl-n { font-size: 12px; font-weight: 700; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .td-mono, .td-leg, .td-st {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 800; color: #cbd5e1;
        white-space: nowrap;
    }
    .td-sub {
        display: block; margin-top: 3px; font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 9.5px; font-weight: 600; color: #46587a; letter-spacing: 0.2px;
    }
    .pk { font-size: 14px; font-weight: 800; }
    .leg-v { font-size: 13px; font-weight: 800; color: #e2e8f0; margin-right: 6px; }
    .td-leg .chip, .td-st .chip { font-family: 'Space Grotesk', 'Quicksand', sans-serif; }

    .foot { font-size: 10.5px; line-height: 1.6; color: #3f5069; margin: 14px 0 0; }

    /* ---------- dossier view ---------- */
    .dv-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .dv-who { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; min-width: 0; }
    .dv-flag { font-size: 15px; line-height: 1; }
    .dv-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 18px; font-weight: 700; color: #e8eefb; }
    .dv-rank { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #4a5b76; }

    /* ---------- tiles (dossier fallback) ---------- */
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .tile {
        display: flex; flex-direction: column; gap: 3px; padding: 14px; border-radius: 12px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.26); min-width: 0;
    }
    .t-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 24px; font-weight: 800; line-height: 1.05; color: #e8eefb; }
    .t-v-sm { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-k { color: var(--k, #e8eefb); }
    .t-l { font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; margin-top: 3px; }
    .t-s { font-size: 10px; font-weight: 600; color: #4a5b76; }

    /* ---------- empty / written states ---------- */
    .empty {
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;
        padding: 30px 18px; border-radius: 14px;
        background: rgba(15,23,42,0.35); border: 1px dashed rgba(51,65,85,0.4);
    }
    .empty-sm { padding: 20px 16px; }
    .empty-ico { font-size: 26px; opacity: 0.45; }
    .empty-t { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #cbd5e1; margin: 0; }
    .empty-p { font-size: 11.5px; line-height: 1.75; color: #56688a; margin: 0; max-width: 640px; }

    /* ---------- responsive ---------- */
    @media (max-width: 900px) {
        .hd-act { align-items: flex-start; }
        .pad { padding: 16px; }
    }
    @media (max-width: 560px) {
        .hd-h { font-size: 20px; }
        .b { padding: 8px 12px; font-size: 10.5px; }
        .slots { grid-template-columns: 1fr; }
        .filt-l { min-width: 100%; }
    }
</style>
