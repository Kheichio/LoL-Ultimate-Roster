<script>
    // The Ranking tab. Everything network-shaped lives in stores/leaderboard.js: the club
    // publishes itself whenever it changes (no button), and this page re-reads the board on
    // open, on every sort change and once a minute while it is visible.
    import { onMount, onDestroy } from 'svelte';
    import ProfileModal from '../modals/ProfileModal.svelte';
    import Icon from '../ui/Icon.svelte';
    import RoadPips from '../ui/RoadPips.svelte';
    import { teamIdentity, squad, club } from '../../stores/game.js';
    import { currentUser } from '../../stores/auth.js';
    import { openSettings, switchTab } from '../../stores/ui.js';
    import { lbRows, lbState, lbSync, fetchBoard, publishNow, myRow, LB_COLUMNS, TITLE_KINDS, GR_STEPS, goldenRoadLine } from '../../stores/leaderboard.js';

    const REFRESH_MS = 60 * 1000;
    const COL = Object.fromEntries([...LB_COLUMNS, ...TITLE_KINDS].map(c => [c.key, c]));
    const SECONDARY = ['trophies', 'titles', 'totalPower', 'splitsCompleted', 'clubSize'];
    // Golden Road rank: roads completed, then how far this year's road has got (a broken road last).
    const grProgress = (r) => (r.grBroken ? -1 : r.grDone || 0);

    let sort = 'trophies';
    let query = '';
    let selected = null;
    let now = Date.now();
    let refreshTimer = null;
    let clock = null;

    onMount(() => {
        fetchBoard(sort);
        refreshTimer = setInterval(() => {
            if (document.visibilityState === 'visible') fetchBoard(sort);
        }, REFRESH_MS);
        clock = setInterval(() => { now = Date.now(); }, 5000);
    });
    onDestroy(() => { clearInterval(refreshTimer); clearInterval(clock); });

    function pickSort(key) {
        if (key === sort) return;
        sort = key;
        fetchBoard(key);
    }

    function ago(ts) {
        if (!ts) return '';
        const s = Math.max(0, Math.round((now - ts) / 1000));
        if (s < 10) return 'just now';
        if (s < 60) return `${s}s ago`;
        const m = Math.round(s / 60);
        return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
    }
    const fmt = (key, v) => (COL[key] && COL[key].format ? COL[key].format(v || 0) : Number(v || 0).toLocaleString());

    // My row is always built from the live stores, so it is never a minute behind what the
    // server holds. It replaces my own server row and the list is re-sorted around it.
    $: me = ($lbRows, $lbSync, $currentUser, $teamIdentity, $squad, $club, now, myRow());
    $: merged = (() => {
        const rows = $lbRows.map(r => (r.isMe ? { ...me, id: r.id, isMe: true } : r));
        return rows.sort((a, b) => ((b[sort] || 0) - (a[sort] || 0))
            || (sort === 'goldenRoads' ? grProgress(b) - grProgress(a) : 0)
            || (sort === 'titles' ? (b.trophies || 0) - (a.trophies || 0) : 0));
    })();
    $: rankOf = new Map(merged.map((r, i) => [r.id, i + 1]));
    $: myRank = merged.findIndex(r => r.isMe) + 1;
    $: q = query.trim().toLowerCase();
    $: filtered = q ? merged.filter(r => `${r.teamName} ${r.displayName}`.toLowerCase().includes(q)) : merged;
    $: podium = q ? [] : merged.slice(0, 3);
    $: listRows = q ? filtered : merged.slice(3);
    $: col = COL[sort];
    // Ranked by Trophies, the side columns become the breakdown of what those trophies are.
    $: secondary = sort === 'titles' ? TITLE_KINDS.map(t => t.key) : SECONDARY.filter(k => k !== sort).slice(0, 3);
    $: medalOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

    $: boardLine = $lbState.status === 'loading' ? 'Updating…'
        : $lbState.status === 'ready' ? `Live · updated ${ago($lbState.fetchedAt)}`
        : $lbState.status === 'idle' ? 'Connecting…' : 'Offline';
    $: syncLine = !$currentUser ? 'Sign in to put your club on the board.'
        : $lbSync.status === 'publishing' ? 'Syncing your club…'
        : $lbSync.status === 'published' ? `Your club synced ${ago($lbSync.at)} · it updates by itself as you play.`
        : ($lbSync.status === 'error' || $lbSync.status === 'offline') ? 'Your club could not be synced.'
        : 'Your club syncs by itself as you play.';
    $: problem = ($lbState.status === 'error' || $lbState.status === 'offline') ? $lbState.error
        : ($lbSync.status === 'error' || $lbSync.status === 'offline') ? $lbSync.error : '';

    async function retry() {
        if ($currentUser) await publishNow({ force: true });
        fetchBoard(sort);
    }
</script>

<section class="lb">
    <!-- ── Hero ── -->
    <header class="hero">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-text">
            <span class="eyebrow"><Icon name="ranking" size={13} stroke={2.2} /> Global ranking</span>
            <h2 class="title">Leaderboard</h2>
            <p class="sub">Every manager's club, ranked live. Pick what to rank by and the top 50 for that column is fetched fresh.</p>
            <div class="status">
                <span class="live" class:live-off={$lbState.status === 'error' || $lbState.status === 'offline'} class:live-busy={$lbState.status === 'loading'}></span>
                <span>{boardLine}</span>
            </div>
        </div>

        <!-- My standing -->
        <div class="me-card" style="--tc: {me.teamColor};">
            <div class="me-top">
                <span class="me-logo">{me.teamLogo}</span>
                <div class="me-id">
                    <span class="me-team">{me.teamName}</span>
                    <span class="me-sub">{$currentUser ? me.displayName : 'Guest'} · Lv {me.managerLevel} · {me.prestigeTitle}</span>
                </div>
            </div>
            <div class="me-stats">
                <div class="me-rank">
                    <span class="mr-n">{myRank ? `#${myRank}` : '—'}</span>
                    <span class="mr-l">{myRank ? `in ${col.label}` : $currentUser ? 'Outside the top 50' : 'Not on the board'}</span>
                </div>
                <div class="me-val" style="--c: {col.color};">
                    <span class="mv-n">{fmt(sort, me[sort])}</span>
                    <span class="mv-l">{col.label}</span>
                </div>
            </div>
            <div class="me-trophies">
                <span class="mt-n"><Icon name="trophy" size={13} stroke={2.2} /> {me.titles} {me.titles === 1 ? 'trophy' : 'trophies'}</span>
                {#each TITLE_KINDS as t (t.key)}
                    <span class="mt-k" style="--c: {t.color};">{t.label} <b>{me[t.key]}</b></span>
                {/each}
            </div>
            <div class="me-road">
                <span class="mrd-t"><Icon name="crown" size={12} stroke={2.2} /> Golden Road</span>
                <RoadPips done={me.grDone} broken={me.grBroken} known={!!me.grYear} size={10} />
                <span class="mrd-l">{goldenRoadLine(me)}{me.goldenRoads ? ` · ${me.goldenRoads} completed` : ''}</span>
            </div>
            <div class="me-sync">
                <Icon name={$currentUser ? 'check' : 'lock'} size={12} stroke={2.4} />
                <span>{syncLine}</span>
            </div>
            {#if !$currentUser}
                <button class="me-btn" on:click={() => openSettings('account')}>Sign in to join</button>
            {/if}
        </div>
    </header>

    {#if problem}
        <div class="problem">
            <Icon name="shield" size={16} />
            <span>{problem}</span>
            <button class="problem-btn" on:click={retry}>Try again</button>
        </div>
    {/if}

    <!-- ── Rank by ── -->
    <div class="sorts" role="tablist" aria-label="Rank by">
        {#each LB_COLUMNS as c (c.key)}
            <button class="sort" class:sort-on={sort === c.key} style="--c: {c.color};" role="tab" aria-selected={sort === c.key} title={c.hint} on:click={() => pickSort(c.key)}>
                <Icon name={c.icon} size={14} stroke={2.1} />
                <span>{c.label}</span>
            </button>
        {/each}
    </div>

    <!-- ── Podium ── -->
    {#if podium.length}
        <div class="podium" class:podium-full={podium.length === 3}>
            {#each medalOrder as p (p.id)}
                {@const rank = rankOf.get(p.id)}
                <button class="pod" class:pod-1={rank === 1} class:pod-2={rank === 2} class:pod-3={rank === 3} class:pod-me={p.isMe} style="--tc: {p.teamColor};" on:click={() => (selected = p)}>
                    <span class="pod-medal">{rank}</span>
                    <span class="pod-logo">{p.teamLogo}</span>
                    <span class="pod-team">{p.teamName}{p.isMe ? ' (You)' : ''}</span>
                    <span class="pod-name">{p.displayName} · Lv {p.managerLevel}</span>
                    <span class="pod-val" style="--c: {col.color};">{fmt(sort, p[sort])}</span>
                    <span class="pod-lbl">{col.label}</span>
                    {#if sort === 'titles'}
                        <span class="pod-break">
                            {#each TITLE_KINDS as t (t.key)}<span style="--c: {t.color};">{t.label} <b>{p[t.key]}</b></span>{/each}
                        </span>
                    {:else if sort === 'goldenRoads'}
                        <span class="pod-road"><RoadPips done={p.grDone} broken={p.grBroken} known={!!p.grYear} size={10} /></span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}

    <!-- ── Table ── -->
    <div class="board">
        <div class="board-bar">
            <span class="board-title">{q ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `Top ${merged.length || 50}`} · {col.label}</span>
            <label class="search">
                <Icon name="search" size={14} />
                <input type="search" bind:value={query} placeholder="Find a team or manager" aria-label="Find a team or manager">
            </label>
        </div>

        <div class="row row-head" style="--n: {secondary.length};">
            <span class="c-rank">#</span>
            <span class="c-man">Manager</span>
            <span class="c-focus">{sort === 'goldenRoads' ? 'Completed' : col.label}</span>
            {#each secondary as k (k)}<span class="c-sec">{COL[k].label}</span>{/each}
        </div>

        {#each listRows as p (p.id)}
            {@const rank = rankOf.get(p.id)}
            <button class="row" class:row-me={p.isMe} style="--tc: {p.teamColor}; --n: {secondary.length};" on:click={() => (selected = p)}>
                <span class="c-rank" class:c-rank-top={rank <= 3}>{rank}</span>
                <span class="c-man">
                    <span class="r-logo">{p.teamLogo}</span>
                    <span class="r-id">
                        <span class="r-team">{p.teamName}{p.isMe ? ' (You)' : ''}</span>
                        {#if sort === 'goldenRoads'}
                            <span class="r-sub r-road"><RoadPips done={p.grDone} broken={p.grBroken} known={!!p.grYear} /> {goldenRoadLine(p) || 'No road data yet'}</span>
                        {:else}
                            <span class="r-sub">{p.displayName} · Lv {p.managerLevel} · {p.prestigeTitle}</span>
                        {/if}
                    </span>
                </span>
                <span class="c-focus" style="--c: {col.color};">{fmt(sort, p[sort])}</span>
                {#each secondary as k (k)}<span class="c-sec">{fmt(k, p[k])}</span>{/each}
            </button>
        {/each}

        {#if !merged.length && $lbState.status === 'ready'}
            <div class="empty">No managers on the board yet. {$currentUser ? 'Your club will appear in a moment.' : 'Sign in and be the first.'}</div>
        {:else if q && !filtered.length}
            <div class="empty">Nobody in the top {merged.length} matches “{query}”.</div>
        {:else if !merged.length && $lbState.status === 'loading'}
            <div class="empty">Loading the board…</div>
        {/if}
    </div>

    <!-- ── Your public profile ── (edited on Home, with the rest of the club's identity) -->
    <div class="profile">
        <div class="pf-head">
            <span class="pf-title">Your public profile</span>
            <span class="pf-sub">Shown when other managers open your club, with your squad and Club showcase.
                {#if $teamIdentity.favouriteTeam || $teamIdentity.favouritePlayer}Favourite{$teamIdentity.favouriteTeam ? ` team: ${$teamIdentity.favouriteTeam}` : ''}{$teamIdentity.favouriteTeam && $teamIdentity.favouritePlayer ? ' ·' : ''}{$teamIdentity.favouritePlayer ? ` player: ${$teamIdentity.favouritePlayer}` : ''}.{/if}</span>
        </div>
        <button class="pf-go" on:click={() => switchTab('home')}>Edit on Home <Icon name="arrow" size={13} /></button>
    </div>
</section>

<ProfileModal player={selected} onClose={() => (selected = null)} />

<style>
    .lb { display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; }

    /* ── Hero ── */
    .hero {
        position: relative; overflow: hidden; display: flex; gap: 24px; align-items: stretch; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(56,189,248,0.14), transparent 65%), linear-gradient(120deg, #0a1420, #0b0e1a 60%);
        border: 1px solid rgba(56,189,248,0.25);
    }
    .hero-glow { position: absolute; right: -80px; top: -120px; width: 360px; height: 360px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(251,191,36,0.09), transparent 65%); }
    .hero-text { position: relative; flex: 1; min-width: 260px; display: flex; flex-direction: column; justify-content: flex-start; padding-top: 6px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #7dd3fc; }
    .title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 520px; }
    .status { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; font-weight: 800; color: #a5f3fc; }
    .live { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; animation: livePulse 1.8s ease-in-out infinite; }
    .live-busy { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }
    .live-off { background: #f87171; box-shadow: none; animation: none; }
    @keyframes livePulse { 50% { opacity: 0.4; } }

    .me-card {
        position: relative; display: flex; flex-direction: column; gap: 12px; min-width: 280px; flex: 0 1 340px;
        padding: 16px 18px; border-radius: 18px;
        background: linear-gradient(150deg, color-mix(in srgb, var(--tc) 16%, rgba(2,6,23,0.6)), rgba(2,6,23,0.6) 70%);
        border: 1px solid color-mix(in srgb, var(--tc) 40%, rgba(148,163,184,0.15));
    }
    .me-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .me-logo { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; background: rgba(2,6,23,0.6); flex-shrink: 0; }
    .me-id { display: flex; flex-direction: column; min-width: 0; }
    .me-team { font-size: 15px; font-weight: 900; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .me-sub { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .me-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .me-rank, .me-val { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 12px; background: rgba(2,6,23,0.55); border: 1px solid rgba(148,163,184,0.12); }
    .mr-n { font-size: 24px; font-weight: 900; color: #fff; line-height: 1; font-variant-numeric: tabular-nums; }
    .mr-l, .mv-l { font-size: 10px; font-weight: 800; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .mv-n { font-size: 24px; font-weight: 900; color: var(--c); line-height: 1; font-variant-numeric: tabular-nums; }
    .me-trophies { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
    .mt-n { display: inline-flex; align-items: center; gap: 5px; margin-right: 2px; font-size: 13px; font-weight: 900; color: #fde68a; }
    .mt-k { font-size: 10.5px; font-weight: 700; color: #94a3b8; padding: 2px 7px; border-radius: 100px; background: rgba(2,6,23,0.55); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
    .mt-k b { color: var(--c); }
    .me-road { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: rgba(2,6,23,0.55); border: 1px solid rgba(234,179,8,0.22); }
    .mrd-t { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; color: #facc15; }
    .mrd-l { font-size: 11px; color: #94a3b8; }
    .me-sync { display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; line-height: 1.45; color: #94a3b8; }
    .me-sync :global(.ico) { margin-top: 2px; color: #34d399; }
    .me-btn { padding: 10px 14px; border-radius: 12px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #2563eb, #4f46e5); }
    .me-btn:hover { filter: brightness(1.1); }

    .problem { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; font-size: 12.5px; line-height: 1.5; color: #fecaca; background: rgba(127,29,29,0.22); border: 1px solid rgba(248,113,113,0.35); }
    .problem span { flex: 1; }
    .problem-btn { padding: 7px 14px; border-radius: 10px; border: 1px solid rgba(248,113,113,0.5); background: rgba(127,29,29,0.35); color: #fee2e2; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }

    /* ── Sorts ── */
    .sorts { display: flex; flex-wrap: wrap; gap: 6px; }
    .sort {
        display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 12px; cursor: pointer;
        font-size: 12px; font-weight: 800; color: #94a3b8;
        background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); transition: all 0.15s;
    }
    .sort :global(.ico) { color: var(--c); }
    .sort:hover { color: #e2e8f0; border-color: color-mix(in srgb, var(--c) 45%, transparent); }
    .sort-on, .sort-on:hover { color: #fff; background: linear-gradient(140deg, color-mix(in srgb, var(--c) 22%, transparent), rgba(12,16,28,0.75)); border-color: color-mix(in srgb, var(--c) 65%, transparent); }

    /* ── Podium ── */
    .podium { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; }
    .pod {
        --m: #94a3b8;
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 18px 12px 16px; border-radius: 18px; cursor: pointer; text-align: center; min-width: 0;
        background: linear-gradient(180deg, color-mix(in srgb, var(--m) 14%, rgba(12,16,28,0.75)), rgba(12,16,28,0.75) 70%);
        border: 1px solid color-mix(in srgb, var(--m) 40%, transparent); transition: transform 0.15s;
    }
    .pod:hover { transform: translateY(-2px); }
    .pod-1 { --m: #fbbf24; padding-top: 28px; box-shadow: 0 10px 30px rgba(251,191,36,0.15); }
    .pod-2 { --m: #cbd5e1; }
    .pod-3 { --m: #d97706; }
    .pod-me { outline: 2px solid #3b82f6; outline-offset: 2px; }
    .pod-medal { position: absolute; top: 10px; left: 12px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; color: #0b1220; background: var(--m); }
    .pod-logo { font-size: 34px; line-height: 1.1; }
    .pod-1 .pod-logo { font-size: 42px; }
    .pod-team { font-size: 14px; font-weight: 900; color: #fff; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pod-name { font-size: 11px; color: #94a3b8; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pod-val { margin-top: 6px; font-size: 24px; font-weight: 900; color: var(--c); font-variant-numeric: tabular-nums; }
    .pod-lbl { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .pod-break { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 6px; }
    .pod-break span { font-size: 10px; font-weight: 700; color: #94a3b8; padding: 1px 7px; border-radius: 100px; background: rgba(2,6,23,0.5); }
    .pod-break b { color: var(--c); }
    .pod-road { margin-top: 6px; }
    .r-road { display: flex !important; align-items: center; gap: 7px; }

    /* ── Board ── */
    .board { border-radius: 18px; overflow: hidden; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); }
    .board-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(71,85,105,0.22); flex-wrap: wrap; }
    .board-title { font-size: 12px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    .search { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 10px; background: rgba(2,6,23,0.55); border: 1px solid rgba(71,85,105,0.35); color: #64748b; min-width: 220px; }
    .search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: #e2e8f0; font-size: 13px; font-family: inherit; }
    .search:focus-within { border-color: rgba(56,189,248,0.6); }

    .row {
        display: grid; grid-template-columns: 44px minmax(0, 1fr) 96px repeat(var(--n, 3), 80px); align-items: center; gap: 8px;
        width: 100%; padding: 10px 16px; text-align: left; cursor: pointer; border: none; font-family: inherit; color: inherit;
        background: linear-gradient(90deg, color-mix(in srgb, var(--tc, #3b82f6) 9%, transparent), transparent 55%);
        border-bottom: 1px solid rgba(71,85,105,0.14); transition: background 0.12s;
    }
    button.row:hover { background: linear-gradient(90deg, color-mix(in srgb, var(--tc, #3b82f6) 16%, transparent), rgba(30,41,59,0.35) 55%); }
    .row-head { cursor: default; background: rgba(2,6,23,0.35); padding-top: 9px; padding-bottom: 9px; font-size: 9.5px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #64748b; }
    .row-me { box-shadow: inset 3px 0 0 #3b82f6; background: linear-gradient(90deg, rgba(59,130,246,0.16), transparent 60%); }
    .c-rank { text-align: center; font-size: 13px; font-weight: 900; color: #64748b; font-variant-numeric: tabular-nums; }
    .c-rank-top { color: #fbbf24; }
    .c-man { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .r-logo { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 19px; background: rgba(2,6,23,0.5); flex-shrink: 0; }
    .r-id { display: flex; flex-direction: column; min-width: 0; }
    .r-team { font-size: 13px; font-weight: 900; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .r-sub { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .c-focus { text-align: right; font-size: 15px; font-weight: 900; color: var(--c, #94a3b8); font-variant-numeric: tabular-nums; }
    .row-head .c-focus { color: #94a3b8; font-size: 9.5px; }
    .c-sec { text-align: right; font-size: 12px; font-weight: 800; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .row-head .c-sec { font-size: 9.5px; color: #64748b; }
    .empty { padding: 36px 16px; text-align: center; font-size: 13px; color: #64748b; }

    /* ── Profile ── */
    .profile { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; padding: 16px 18px; border-radius: 18px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); }
    .pf-head { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 3px; }
    .pf-title { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .pf-sub { font-size: 12px; color: #64748b; line-height: 1.5; }
    .pf-go { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 11px; font-size: 12.5px; font-weight: 800; color: #e0f2fe; cursor: pointer; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.35); }
    .pf-go:hover { background: rgba(56,189,248,0.2); }

    @media (max-width: 860px) {
        .row { grid-template-columns: 36px minmax(0, 1fr) 84px; }
        .c-sec { display: none; }
    }
    @media (max-width: 620px) {
        .hero { padding: 18px; }
        .me-card { flex-basis: 100%; min-width: 0; }
        .podium { grid-template-columns: 1fr; }
        .pod-1 { order: -1; }
        .search { min-width: 0; flex: 1; }
        .row { padding: 9px 12px; }
    }
</style>
