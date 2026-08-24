<script>
    // =====================================================================
    //  LoL ULTIMATE CAREER -- character creator
    // =====================================================================
    //  A staged flow with a persistent live preview. Every selection re-runs
    //  previewAttrs()/previewPotential(), so the eight bars and the OVR move
    //  the instant something is clicked -- that responsiveness is the point
    //  of the screen. Nothing touches the career store until Start Career.

    import { onDestroy } from 'svelte';
    import {
        START_PATHS, REGIONS, ROLES, PLAYSTYLES, CHAMPIONS, championsForRole,
        ATTRS, AGE_TRADE,
    } from '../../career/constants.js';
    import {
        previewAttrs, previewPotential, calcOVR, calcPotentialOVR, ovrTier, ovrLabel,
    } from '../../career/ratings.js';
    import { createCareer, careerScreen } from '../../stores/career.js';
    import { CAREER_PILLARS, openMenu } from '../../stores/menu.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    // --- Stage rail ------------------------------------------------------
    const STAGES = [
        'Intro', 'Path', 'Age', 'Region', 'Role', 'Playstyle', 'Champion', 'Handle', 'Confirm',
    ];
    const LAST = STAGES.length - 1;

    let stage = 0;
    let maxStage = 0;

    // --- Selections ------------------------------------------------------
    let pathId = '';
    let age = null;
    let regionId = '';
    let roleId = '';
    let playstyleId = '';
    let championId = '';
    let handle = '';
    let champSearch = '';
    let hoverChamp = null;

    const ATTR_MAP = ATTRS.reduce((m, a) => { m[a.key] = a; return m; }, {});

    // --- Derived selection objects --------------------------------------
    $: path   = START_PATHS.find(p => p.id === pathId) || null;
    $: region = REGIONS.find(r => r.id === regionId) || null;
    $: role   = ROLES.find(r => r.id === roleId) || null;
    $: styles = roleId ? (PLAYSTYLES[roleId] || []) : [];
    $: style  = styles.find(s => s.id === playstyleId) || null;
    $: champ  = CHAMPIONS.find(c => c.id === championId) || null;
    $: accent = path ? path.accent : '#a78bfa';

    // --- Live preview ----------------------------------------------------
    // previewAttrs() falls back to Europe until a region is picked, so the
    // panel says so out loud rather than pretending the number is final.
    $: effAge = age !== null ? age : (path ? path.ages[0] : 13);
    $: pvAttrs = path
        ? previewAttrs({ pathId: path.id, age: effAge, regionId, roleId, playstyleId, championId })
        : null;
    $: pvPot = path ? previewPotential({ pathId: path.id, age: effAge, roleId }) : null;
    $: pvOVR = pvAttrs ? Math.round(roleId ? calcOVR(pvAttrs, roleId) : meanAttrs(pvAttrs)) : 0;
    $: pvPotOVR = pvPot ? Math.round(roleId ? calcPotentialOVR(pvPot, roleId) : meanAttrs(pvPot)) : 0;
    $: pvTier = ovrTier(pvOVR);
    $: pvHeadroom = Math.max(0, pvPotOVR - pvOVR);

    function meanAttrs(a) {
        let s = 0;
        for (const at of ATTRS) s += a[at.key] || 0;
        return s / ATTRS.length;
    }
    function pct(v) { return Math.max(0, Math.min(100, ((v || 0) / 99) * 100)); }
    function sign(v) { return v > 0 ? '+' + v : String(v); }

    // A small +/- flash beside the OVR whenever a choice moves it.
    let lastOVR = null;
    let ovrDelta = 0;
    let deltaTimer = null;
    $: trackOVR(pvOVR, !!pvAttrs);

    function trackOVR(v, ready) {
        if (!ready) { lastOVR = null; return; }
        if (lastOVR === null) { lastOVR = v; return; }
        if (v === lastOVR) return;
        ovrDelta = v - lastOVR;
        lastOVR = v;
        if (deltaTimer) clearTimeout(deltaTimer);
        deltaTimer = setTimeout(() => { ovrDelta = 0; deltaTimer = null; }, 1500);
    }
    onDestroy(() => { if (deltaTimer) clearTimeout(deltaTimer); });

    // --- Path comparison numbers (copy is derived, never hard-coded) -----
    const PRECOMP = START_PATHS.find(p => p.id === 'precomp') || START_PATHS[0];
    const DEBUT = START_PATHS.find(p => p.id === 'debut') || START_PATHS[1];
    const BASE_GAP = Math.round(DEBUT.baseAttr - PRECOMP.baseAttr);
    const POT_GAP = Math.round(
        (PRECOMP.potentialBase + PRECOMP.potentialBonus) - (DEBUT.potentialBase + DEBUT.potentialBonus)
    );
    function ceilingOf(p) { return p.potentialBase + p.potentialBonus; }

    // --- Region comparison bars ------------------------------------------
    const REGION_METRICS = [
        { key: 'difficulty', label: 'League Strength', color: '#ef4444' },
        { key: 'salaryMult', label: 'Salaries',        color: '#eab308' },
        { key: 'hypeMult',   label: 'Hype',            color: '#ec4899' },
        { key: 'scoutMult',  label: 'Scouting',        color: '#22c55e' },
    ];
    const METRIC_RANGE = REGION_METRICS.reduce((m, met) => {
        const vals = REGIONS.map(r => r[met.key]);
        m[met.key] = { min: Math.min(...vals), max: Math.max(...vals) };
        return m;
    }, {});
    function metricPct(key, v) {
        const r = METRIC_RANGE[key];
        if (!r || r.max === r.min) return 60;
        return 16 + ((v - r.min) / (r.max - r.min)) * 84;
    }

    // --- Mods / growth / weights -> renderable rows -----------------------
    function modChips(mods) {
        return Object.entries(mods || {})
            .filter(([k, v]) => v !== 0 && ATTR_MAP[k])
            .map(([k, v]) => ({ v, abbr: ATTR_MAP[k].abbr, color: ATTR_MAP[k].color }))
            .sort((a, b) => b.v - a.v);
    }
    function growthChips(growth) {
        return Object.entries(growth || {})
            .filter(([k]) => ATTR_MAP[k])
            .map(([k, v]) => ({ v, abbr: ATTR_MAP[k].abbr, color: ATTR_MAP[k].color }))
            .sort((a, b) => b.v - a.v);
    }
    function weightRows(r) {
        const max = Math.max(...ATTRS.map(a => r.weights[a.key] || 0)) || 1;
        return ATTRS
            .map(a => ({ abbr: a.abbr, color: a.color, w: r.weights[a.key] || 0, rel: ((r.weights[a.key] || 0) / max) * 100 }))
            .sort((a, b) => b.w - a.w);
    }
    function biasRows(b) {
        return [
            { label: 'Aggression', v: b.aggression, color: '#ef4444' },
            { label: 'Risk',       v: b.risk,       color: '#f59e0b' },
            { label: 'Teamplay',   v: b.teamplay,   color: '#22c55e' },
        ];
    }

    // --- Champions -------------------------------------------------------
    $: champPool = roleId ? championsForRole(roleId) : [];
    $: champFiltered = (() => {
        const q = champSearch.trim().toLowerCase();
        if (!q) return champPool;
        return champPool.filter(c => c.name.toLowerCase().includes(q) || c.archetype.toLowerCase().includes(q));
    })();
    $: champGroups = (() => {
        const map = new Map();
        for (const c of champFiltered) {
            if (!map.has(c.archetype)) map.set(c.archetype, []);
            map.get(c.archetype).push(c);
        }
        return [...map.entries()].map(([name, items]) => ({ name, items }))
            .sort((a, b) => a.name.localeCompare(b.name));
    })();
    $: champDetail = hoverChamp || champ;

    // --- Handles ---------------------------------------------------------
    const HANDLE_POOL = [
        'Vexen', 'Nocturn', 'Kairos', 'Solstice', 'Zephyr', 'Onyx', 'Vantage', 'Halcyon',
        'Mirage', 'Quasar', 'Ember', 'Vector', 'Nimbus', 'Requiem', 'Cipher', 'Fable',
        'Sable', 'Kismet', 'Havoc', 'Lucent', 'Orbit', 'Prism', 'Sonder', 'Tempo',
        'Umbra', 'Verge', 'Zenith', 'Aster', 'Crux', 'Dusk', 'Echo', 'Flux',
        'Halo', 'Jolt', 'Lumen', 'Riftwalk', 'Wraith', 'Yield', 'Azimuth', 'Bastion',
        'Cadence', 'Delta', 'Eclipse', 'Fathom', 'Gambit', 'Harbor',
    ];
    function randomiseHandle() {
        let next = handle;
        let guard = 0;
        while (next === handle && guard++ < 12) {
            next = HANDLE_POOL[Math.floor(Math.random() * HANDLE_POOL.length)];
        }
        handle = next.slice(0, 16);
        playSound('click');
    }
    $: cleanHandle = handle.trim().slice(0, 16);
    $: handleValid = cleanHandle.length >= 2;

    // --- Stage validity --------------------------------------------------
    // Kept as a plain reactive array: template expressions depend on values,
    // not on function calls, so every jump/disable state stays live.
    $: valid = [
        true,
        !!pathId,
        age !== null,
        !!regionId,
        !!roleId,
        !!playstyleId,
        !!championId,
        handleValid,
        true,
    ];
    $: canNext = valid[stage];
    $: canFinish = valid.slice(1, 8).every(Boolean);
    $: railSteps = STAGES.slice(1).map((label, idx) => {
        const i = idx + 1;
        return {
            i, label,
            on: i === stage,
            done: i < stage && valid[i],
            jump: i <= maxStage && valid.slice(0, i).every(Boolean),
        };
    });

    // --- Navigation ------------------------------------------------------
    function goto(i, silent) {
        const target = Math.max(0, Math.min(LAST, i));
        if (target === stage) return;
        stage = target;
        maxStage = Math.max(maxStage, stage);
        hoverChamp = null;
        if (!silent) playSound('click');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function next() {
        if (stage === LAST) { confirmCareer(); return; }
        if (!canNext) return;
        goto(stage + 1);
    }
    function back() { if (stage > 0) goto(stage - 1); }
    function jump(i) {
        const step = railSteps.find(r => r.i === i);
        if (i > 0 && (!step || !step.jump)) return;
        goto(i);
    }
    function onKey(e) {
        if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA') return;
        e.preventDefault();
        if (stage === LAST) confirmCareer();
        else if (canNext) next();
    }

    // --- Selection handlers (each resets what it invalidates) ------------
    function pickPath(id) {
        if (pathId === id) return;
        pathId = id; age = null;
        maxStage = Math.min(maxStage, Math.max(stage, 2));
        playSound('click');
    }
    function pickAge(v) { if (age !== v) { age = v; playSound('click'); } }
    function pickRegion(id) { if (regionId !== id) { regionId = id; playSound('click'); } }
    function pickRole(id) {
        if (roleId === id) return;
        roleId = id; playstyleId = ''; championId = ''; hoverChamp = null; champSearch = '';
        maxStage = Math.min(maxStage, Math.max(stage, 5));
        playSound('click');
    }
    function pickStyle(id) { if (playstyleId !== id) { playstyleId = id; playSound('click'); } }
    function pickChamp(id) { if (championId !== id) { championId = id; playSound('click'); } }

    function toMenu() { playSound('click'); openMenu(); }

    function confirmCareer() {
        if (!canFinish) {
            const missing = [1, 2, 3, 4, 5, 6, 7].find(i => !valid[i]);
            if (missing !== undefined) {
                showToast('Finish the ' + STAGES[missing].toLowerCase() + ' step first.', 'error');
                goto(missing, true);
            }
            return;
        }
        createCareer({
            handle: cleanHandle, pathId, age, regionId, roleId, playstyleId, championId,
        });
        careerScreen.set('hub');
        playSound('win');
        showToast(cleanHandle + ' signs on. Welcome to Ultimate Career.', 'success');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    // --- Summary (stage 7 grid + preview chips) --------------------------
    $: summary = [
        { label: 'Path',      value: path ? path.name : null,          accent: path ? path.accent : null,     step: 1 },
        { label: 'Age',       value: age !== null ? String(age) : null, accent: null,                         step: 2 },
        { label: 'Region',    value: region ? region.league : null,    accent: region ? region.accent : null, step: 3 },
        { label: 'Role',      value: role ? role.name : null,          accent: role ? role.accent : null,     step: 4 },
        { label: 'Playstyle', value: style ? style.name : null,        accent: null,                          step: 5 },
        { label: 'Champion',  value: champ ? champ.name : null,        accent: null,                          step: 6 },
        { label: 'Handle',    value: cleanHandle || null,              accent: null,                          step: 7 },
    ].map(s => ({ ...s, jump: s.step <= maxStage && valid.slice(0, s.step).every(Boolean) }));
</script>

<svelte:window on:keydown={onKey} />

<section class="cp" style="--accent:{accent}; --tier:{pvTier.color}">
    <div class="cp-glow" aria-hidden="true"></div>

    {#if stage === 0}
        <!-- ============== 0 - INTRO ============== -->
        <div class="intro">
            <div class="intro-mark">Studio8Heads presents</div>
            <h1 class="intro-h">
                <span class="intro-h1">LoL Ultimate</span>
                <span class="intro-h2">Career</span>
            </h1>
            <p class="intro-tag">Create &middot; Train &middot; Ascend</p>
            <p class="intro-p">
                One player. One career. You are not running an organisation from a spreadsheet &mdash;
                you are the kid in the chair, and every week is a choice about what to practise, who to
                sign for, and what you are willing to give up to be the best in the world.
            </p>

            <div class="pillars">
                {#each CAREER_PILLARS as p, i}
                    <div class="pillar">
                        <span class="pillar-n">{String(i + 1).padStart(2, '0')}</span>
                        <div class="pillar-body">
                            <h3 class="pillar-h">{p.name}</h3>
                            <p class="pillar-d">{p.desc}</p>
                        </div>
                    </div>
                {/each}
            </div>

            <div class="intro-acts">
                <button class="big-cta" on:click={() => goto(1)}>Create Your Player</button>
                <button class="quiet" on:click={toMenu}>Back to Menu</button>
            </div>
            <p class="intro-note">Eight choices. Everything after that is earned.</p>
        </div>

    {:else}
        <!-- ============== RAIL ============== -->
        <header class="rail-wrap">
            <div class="rail-top">
                <button class="icon-btn" on:click={toMenu} aria-label="Back to main menu" title="Back to main menu">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M10 3 5 8l5 5" />
                    </svg>
                </button>
                <div class="rail-title">
                    <span class="rail-kicker">Ultimate Career</span>
                    <span class="rail-name">{STAGES[stage]}</span>
                </div>
                <span class="rail-count">Step {stage} <span class="rail-of">of {LAST}</span></span>
            </div>

            <nav class="rail" aria-label="Creation steps">
                {#each railSteps as r}
                    <button
                        class="rail-step" class:on={r.on} class:done={r.done}
                        disabled={!r.jump}
                        on:click={() => jump(r.i)}
                        aria-current={r.on ? 'step' : undefined}
                        aria-label="Step {r.i}: {r.label}"
                    >
                        <span class="rs-n">{r.i}</span>
                        <span class="rs-l">{r.label}</span>
                    </button>
                {/each}
            </nav>
        </header>

        <div class="cp-body">
            <!-- ============== STAGE CONTENT ============== -->
            <div class="cp-main">
                {#key stage}
                    <div class="stagefade">

                        <!-- ---------- 1 - PATH ---------- -->
                        {#if stage === 1}
                            <div class="head">
                                <h2 class="h2">Where does this start?</h2>
                                <p class="sub">The single biggest decision in the mode. One path is ready now, the other is better later &mdash; and there is no way to have both.</p>
                            </div>

                            <div class="trade">
                                <span class="trade-l">The trade</span>
                                <p class="trade-p">
                                    Pre-Competitive starts about <b>{BASE_GAP} attribute points behind</b> an academy
                                    debutant and finishes about <b>{POT_GAP} points ahead of them at the ceiling</b>. It
                                    also gets an extra weekly action and free role changes; the debutant gets a salary,
                                    a coach and club-gated training from week one.
                                </p>
                            </div>

                            <div class="pathgrid">
                                {#each START_PATHS as p}
                                    <button class="pathcard" class:sel={pathId === p.id} style="--a:{p.accent}"
                                        on:click={() => pickPath(p.id)} aria-pressed={pathId === p.id}>
                                        <span class="pc-stripe" aria-hidden="true"></span>
                                        <span class="pc-top">
                                            <span class="pc-name">{p.name}</span>
                                            <span class="pc-tag">{p.tag}</span>
                                        </span>
                                        <span class="pc-blurb">{p.blurb}</span>

                                        <span class="pc-stats">
                                            <span class="pcs"><span class="pcs-v">{p.baseAttr}</span><span class="pcs-l">Base attrs</span></span>
                                            <span class="pcs"><span class="pcs-v">{ceilingOf(p)}</span><span class="pcs-l">Ceiling</span></span>
                                            <span class="pcs"><span class="pcs-v">{p.weeklyActions}</span><span class="pcs-l">Actions/wk</span></span>
                                            <span class="pcs"><span class="pcs-v">{p.startGold}</span><span class="pcs-l">Start gold</span></span>
                                        </span>

                                        <span class="pc-list">
                                            <span class="pl-h good">Strengths</span>
                                            {#each p.perks as perk}
                                                <span class="pl-row"><span class="pl-i good" aria-hidden="true">+</span>{perk}</span>
                                            {/each}
                                        </span>
                                        <span class="pc-list">
                                            <span class="pl-h bad">Costs</span>
                                            {#each p.risks as risk}
                                                <span class="pl-row"><span class="pl-i bad" aria-hidden="true">-</span>{risk}</span>
                                            {/each}
                                        </span>

                                        <span class="pc-pick">{pathId === p.id ? 'Selected' : 'Choose this path'}</span>
                                    </button>
                                {/each}
                            </div>

                        <!-- ---------- 2 - AGE ---------- -->
                        {:else if stage === 2}
                            <div class="head">
                                <h2 class="h2">How old are you when we join?</h2>
                                <p class="sub">
                                    Every year you wait is <b>{sign(AGE_TRADE.attrPerYear)} to every starting attribute</b>
                                    and <b>{AGE_TRADE.potentialPerYear} to your potential ceiling</b>. Start younger to
                                    finish higher; start older to be useful sooner.
                                </p>
                            </div>

                            {#if path}
                                <div class="agegrid">
                                    {#each path.ages as a, i}
                                        <button class="agecard" class:sel={age === a} on:click={() => pickAge(a)} aria-pressed={age === a}>
                                            <span class="ac-n">{a}</span>
                                            <span class="ac-l">years old</span>
                                            <span class="ac-rows">
                                                <span class="ac-row">
                                                    <span class="ac-k">Base attrs</span>
                                                    <span class="ac-v pos">{path.baseAttr + i * AGE_TRADE.attrPerYear}</span>
                                                </span>
                                                <span class="ac-row">
                                                    <span class="ac-k">Ceiling</span>
                                                    <span class="ac-v neg">{ceilingOf(path) + i * AGE_TRADE.potentialPerYear}</span>
                                                </span>
                                            </span>
                                            <span class="ac-delta">
                                                {#if i === 0}
                                                    Longest runway. The highest career you can build.
                                                {:else}
                                                    {sign(i * AGE_TRADE.attrPerYear)} now, {i * AGE_TRADE.potentialPerYear} later.
                                                {/if}
                                            </span>
                                        </button>
                                    {/each}
                                </div>
                                <p class="foot-note">
                                    Growth also slows on its own with age &mdash; a thirteen-year-old converts training
                                    into attributes far faster than an eighteen-year-old ever will.
                                </p>
                            {/if}

                        <!-- ---------- 3 - REGION ---------- -->
                        {:else if stage === 3}
                            <div class="head">
                                <h2 class="h2">Which scene raised you?</h2>
                                <p class="sub">Your region shifts your starting attributes permanently and sets the weather for the whole career: how hard the league is, what it pays, and how loudly the world hears about it.</p>
                            </div>

                            <div class="regiongrid">
                                {#each REGIONS as r}
                                    <button class="regcard" class:sel={regionId === r.id} style="--a:{r.accent}"
                                        on:click={() => pickRegion(r.id)} aria-pressed={regionId === r.id}>
                                        <span class="rc-top">
                                            <span class="rc-flag" aria-hidden="true">{r.flag}</span>
                                            <span class="rc-names">
                                                <span class="rc-name">{r.name}</span>
                                                <span class="rc-league">{r.league}</span>
                                            </span>
                                            <span class="rc-train">Training x{r.trainingMult.toFixed(2)}</span>
                                        </span>
                                        <span class="rc-blurb">{r.blurb}</span>
                                        <span class="chips">
                                            {#each modChips(r.mods) as m}
                                                <span class="chip" class:neg={m.v < 0} style="--c:{m.color}"><b>{m.abbr}</b>{sign(m.v)}</span>
                                            {/each}
                                        </span>
                                        <span class="metrics">
                                            {#each REGION_METRICS as met}
                                                <span class="metric">
                                                    <span class="met-l">{met.label}</span>
                                                    <span class="met-bar"><span class="met-fill" style="width:{metricPct(met.key, r[met.key])}%; background:{met.color}"></span></span>
                                                </span>
                                            {/each}
                                        </span>
                                    </button>
                                {/each}
                            </div>

                        <!-- ---------- 4 - ROLE ---------- -->
                        {:else if stage === 4}
                            <div class="head">
                                <h2 class="h2">Which seat is yours?</h2>
                                <p class="sub">Your role decides how the eight attributes are weighted into a single rating. An ADC lives on mechanics and teamfighting; a support can be world class with hands that never win a 1v1.</p>
                            </div>

                            <div class="rolegrid">
                                {#each ROLES as r}
                                    <button class="rolecard" class:sel={roleId === r.id} style="--a:{r.accent}"
                                        on:click={() => pickRole(r.id)} aria-pressed={roleId === r.id}>
                                        <span class="ro-top">
                                            <img class="ro-ico" src={r.icon} alt="" />
                                            <span class="ro-names">
                                                <span class="ro-name">{r.name}</span>
                                                <span class="ro-short">{r.short}</span>
                                            </span>
                                        </span>
                                        <span class="ro-blurb">{r.blurb}</span>
                                        <span class="ro-weights">
                                            <span class="wt-h">Rating weighting</span>
                                            {#each weightRows(r) as w, i}
                                                <span class="wt-row" class:key={i < 3}>
                                                    <span class="wt-abbr" style="color:{w.color}">{w.abbr}</span>
                                                    <span class="wt-bar"><span class="wt-fill" style="width:{w.rel}%; background:{w.color}"></span></span>
                                                    <span class="wt-pct">{Math.round(w.w * 100)}%</span>
                                                </span>
                                            {/each}
                                        </span>
                                    </button>
                                {/each}
                            </div>

                        <!-- ---------- 5 - PLAYSTYLE ---------- -->
                        {:else if stage === 5}
                            <div class="head">
                                <h2 class="h2">How do you play {role ? role.short.toLowerCase() : 'the game'}?</h2>
                                <p class="sub">Playstyle shifts your starting attributes, multiplies training gains on those same attributes for the rest of your life, and tells the match engine which in-game decisions actually suit you.</p>
                            </div>

                            <div class="stylegrid">
                                {#each styles as s}
                                    <button class="stylecard" class:sel={playstyleId === s.id}
                                        style="--a:{role ? role.accent : '#a78bfa'}"
                                        on:click={() => pickStyle(s.id)} aria-pressed={playstyleId === s.id}>
                                        <span class="sc-name">{s.name}</span>
                                        <span class="sc-blurb">{s.blurb}</span>
                                        <span class="chips">
                                            {#each modChips(s.mods) as m}
                                                <span class="chip" class:neg={m.v < 0} style="--c:{m.color}"><b>{m.abbr}</b>{sign(m.v)}</span>
                                            {/each}
                                        </span>
                                        <span class="bias">
                                            {#each biasRows(s.bias) as b}
                                                <span class="bias-row">
                                                    <span class="bias-l">{b.label}</span>
                                                    <span class="bias-bar"><span class="bias-fill" style="width:{Math.round(b.v * 100)}%; background:{b.color}"></span></span>
                                                    <span class="bias-v">{Math.round(b.v * 100)}</span>
                                                </span>
                                            {/each}
                                        </span>
                                        <span class="growth">
                                            <span class="gr-h">Lifetime training</span>
                                            {#each growthChips(s.growth) as g}
                                                <span class="gr-chip" class:down={g.v < 1} style="--c:{g.color}">{g.abbr} x{g.v.toFixed(2)}</span>
                                            {/each}
                                        </span>
                                    </button>
                                {/each}
                            </div>

                        <!-- ---------- 6 - CHAMPION ---------- -->
                        {:else if stage === 6}
                            <div class="head">
                                <h2 class="h2">What is your signature pick?</h2>
                                <p class="sub">One champion you are known for. It shims your starting attributes forever, and the match engine hands you a comfort bonus in every game you get it.</p>
                            </div>

                            <div class="champbar">
                                <input class="input champ-search" type="text" bind:value={champSearch}
                                    placeholder="Search champion or archetype..." aria-label="Search champions"
                                    autocomplete="off" spellcheck="false" />
                                <span class="champ-count">{champFiltered.length} available</span>
                            </div>

                            {#if champDetail}
                                <div class="champdetail">
                                    <span class="cd-name">{champDetail.name}</span>
                                    <span class="cd-arch">{champDetail.archetype}</span>
                                    <span class="chips">
                                        {#each modChips(champDetail.mods) as m}
                                            <span class="chip" class:neg={m.v < 0} style="--c:{m.color}"><b>{m.abbr}</b>{sign(m.v)}</span>
                                        {/each}
                                    </span>
                                </div>
                            {:else}
                                <div class="champdetail empty">Hover or select a champion to see exactly what it gives you.</div>
                            {/if}

                            {#if champGroups.length === 0}
                                <div class="emptybox">
                                    <p>No champion here matches that search.</p>
                                    <button class="quiet" on:click={() => (champSearch = '')}>Clear search</button>
                                </div>
                            {:else}
                                <!-- Scrolls internally so the search box and the
                                     hover read-out stay pinned. A role can carry
                                     50+ champions across a dozen archetypes, and
                                     without this the step is a 2000px page where
                                     you cannot see what you are hovering. -->
                                <div class="champscroll">
                                {#each champGroups as g}
                                    <div class="cgroup">
                                        <div class="label">{g.name}</div>
                                        <div class="cwrap">
                                            {#each g.items as c}
                                                <button class="cchip" class:sel={championId === c.id}
                                                    on:click={() => pickChamp(c.id)}
                                                    on:mouseenter={() => (hoverChamp = c)}
                                                    on:mouseleave={() => (hoverChamp = null)}
                                                    on:focus={() => (hoverChamp = c)}
                                                    on:blur={() => (hoverChamp = null)}
                                                    aria-pressed={championId === c.id}>
                                                    <span class="cc-name">{c.name}</span>
                                                    <span class="cc-mods">
                                                        {#each modChips(c.mods) as m}
                                                            <span class="cc-mod" class:neg={m.v < 0} style="--c:{m.color}">{m.abbr}{sign(m.v)}</span>
                                                        {/each}
                                                    </span>
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/each}
                                </div>
                            {/if}

                        <!-- ---------- 7 - HANDLE ---------- -->
                        {:else if stage === 7}
                            <div class="head">
                                <h2 class="h2">What do they chant?</h2>
                                <p class="sub">Sixteen characters, on a jersey, on a scoreboard, in a crowd. Pick something you would not mind hearing for ten years.</p>
                            </div>

                            <div class="handlebox">
                                <div class="hb-field">
                                    <input class="input hb-input" type="text" maxlength="16" bind:value={handle}
                                        placeholder="Your handle" aria-label="Player handle, maximum 16 characters"
                                        autocomplete="off" spellcheck="false" />
                                    <button class="hb-rand" on:click={randomiseHandle} aria-label="Randomise handle" title="Randomise handle">
                                        <span aria-hidden="true">&#x1F3B2;</span>
                                    </button>
                                </div>
                                <div class="hb-meta">
                                    <span class="hb-count" class:warn={cleanHandle.length > 13}>{cleanHandle.length}/16</span>
                                    {#if handleValid}
                                        <span class="hb-ok">Looks good.</span>
                                    {:else}
                                        <span class="hb-hint">At least two characters, please.</span>
                                    {/if}
                                </div>
                            </div>

                            <div class="label">Your player so far</div>
                            <div class="sumgrid">
                                {#each summary as s}
                                    <button class="sumcell" disabled={!s.jump} on:click={() => jump(s.step)} aria-label="Change {s.label}">
                                        <span class="sum-k">{s.label}</span>
                                        <span class="sum-v" style={s.accent ? `color:${s.accent}` : ''}>{s.value || '--'}</span>
                                    </button>
                                {/each}
                            </div>

                        <!-- ---------- 8 - CONFIRM ---------- -->
                        {:else}
                            <div class="head">
                                <h2 class="h2">This is you.</h2>
                                <p class="sub">Read it once more. Your real attributes are rolled around this projection with a little variance, and the ceiling leans toward whatever your role values most.</p>
                            </div>

                            <div class="finalcard">
                                <div class="fc-head">
                                    <div class="fc-ovr">
                                        <span class="fc-ovr-n">{pvOVR}</span>
                                        <span class="fc-ovr-l">OVR</span>
                                    </div>
                                    <div class="fc-id">
                                        <div class="fc-handle">
                                            <span class="fc-name">{cleanHandle || 'Rookie'}</span>
                                            {#if region}<span class="fc-flag" aria-hidden="true">{region.flag}</span>{/if}
                                            {#if role}<span class="fc-role" style="--rc:{role.accent}">{role.short}</span>{/if}
                                        </div>
                                        <div class="fc-sub">
                                            <span class="fc-tier">{pvTier.quality}</span>
                                            <span class="fc-dot">&middot;</span>
                                            <span>{ovrLabel(pvOVR)}</span>
                                            <span class="fc-dot">&middot;</span>
                                            <span>Age {effAge}</span>
                                            {#if path}
                                                <span class="fc-dot">&middot;</span>
                                                <span style="color:{path.accent}">{path.name}</span>
                                            {/if}
                                        </div>
                                        <div class="fc-line">
                                            {#if style}<span>{style.name}</span>{/if}
                                            {#if style && champ}<span class="fc-dot">&middot;</span>{/if}
                                            {#if champ}<span>{champ.name}</span>{/if}
                                        </div>
                                    </div>
                                    <div class="fc-pot">
                                        <span class="fc-pot-n">{pvPotOVR}</span>
                                        <span class="fc-pot-l">Potential</span>
                                        <span class="fc-pot-d">+{pvHeadroom} to grow</span>
                                    </div>
                                </div>

                                {#if pvAttrs && pvPot}
                                    <div class="fc-attrs">
                                        {#each ATTRS as a}
                                            <div class="fa" title={a.desc}>
                                                <div class="fa-top">
                                                    <span class="fa-name" style="color:{a.color}">{a.name}</span>
                                                    <span class="fa-nums">
                                                        <span class="fa-v">{Math.round(pvAttrs[a.key])}</span>
                                                        <span class="fa-slash">/</span>
                                                        <span class="fa-p">{Math.round(pvPot[a.key])}</span>
                                                    </span>
                                                </div>
                                                <div class="fa-track">
                                                    <div class="fa-ghost" style="width:{pct(pvPot[a.key])}%; background:{a.color}"></div>
                                                    <div class="fa-fill" style="width:{pct(pvAttrs[a.key])}%; background:{a.color}"></div>
                                                    <div class="fa-cap" style="left:{pct(pvPot[a.key])}%; background:{a.color}"></div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}

                                <button class="start" on:click={confirmCareer} disabled={!canFinish}>Start Career</button>
                                <p class="fc-note">Your career save is separate from Ultimate Roster and can be reset from the profile screen at any time.</p>
                            </div>
                        {/if}
                    </div>
                {/key}
            </div>

            <!-- ============== LIVE PREVIEW ============== -->
            <aside class="cp-preview" aria-label="Live player preview">
                <div class="pv">
                    <div class="pv-head">
                        <div class="pv-ovr">
                            <span class="pv-ovr-n">{pvAttrs ? pvOVR : '--'}</span>
                            <span class="pv-ovr-l">{roleId ? 'OVR' : 'AVG'}</span>
                            {#if ovrDelta !== 0}
                                <span class="pv-delta" class:down={ovrDelta < 0}>{sign(ovrDelta)}</span>
                            {/if}
                        </div>
                        <div class="pv-meta">
                            <span class="pv-tier">{pvAttrs ? pvTier.quality : 'Unset'}</span>
                            <span class="pv-label">{pvAttrs ? ovrLabel(pvOVR) : 'No player yet'}</span>
                            <span class="pv-pot">
                                Ceiling <b>{pvAttrs ? pvPotOVR : '--'}</b>
                                {#if pvAttrs}<span class="pv-room">(+{pvHeadroom})</span>{/if}
                            </span>
                        </div>
                    </div>

                    {#if !pvAttrs}
                        <div class="pv-empty">
                            <p>Pick a starting path and your player appears here, live.</p>
                            <p class="pv-empty-s">Every choice after that moves these bars instantly.</p>
                        </div>
                    {:else}
                        <div class="pv-bars">
                            {#each ATTRS as a}
                                <div class="pv-row" title="{a.name} - {a.desc}">
                                    <span class="pv-abbr" style="color:{a.color}">{a.abbr}</span>
                                    <span class="pv-track">
                                        <span class="pv-ghost" style="width:{pct(pvPot[a.key])}%; background:{a.color}"></span>
                                        <span class="pv-fill" style="width:{pct(pvAttrs[a.key])}%; background:{a.color}"></span>
                                        <span class="pv-cap" style="left:{pct(pvPot[a.key])}%; background:{a.color}"></span>
                                    </span>
                                    <span class="pv-v">{Math.round(pvAttrs[a.key])}</span>
                                    <span class="pv-p">{Math.round(pvPot[a.key])}</span>
                                </div>
                            {/each}
                        </div>

                        <div class="pv-legend">
                            <span class="lg"><span class="lg-s"></span>Now</span>
                            <span class="lg"><span class="lg-s ghost"></span>Ceiling</span>
                        </div>

                        <div class="pv-chips">
                            {#each summary as s}
                                {#if s.value}
                                    <span class="pv-chip" style="--c:{s.accent || '#64748b'}">{s.value}</span>
                                {/if}
                            {/each}
                        </div>

                        {#if !regionId}
                            <p class="pv-note">Region not chosen yet &mdash; the preview assumes Europe until you pick one.</p>
                        {:else if !roleId}
                            <p class="pv-note">The rating is a flat average until you pick a role to weight it.</p>
                        {/if}
                    {/if}
                </div>
            </aside>
        </div>

        <!-- ============== FOOTER NAV ============== -->
        <footer class="cp-foot">
            <button class="nav-back" on:click={back}>Back</button>
            <span class="foot-hint">
                {#if stage === LAST}Press Enter to start{:else if canNext}Press Enter to continue{:else}{STAGES[stage]} required{/if}
            </span>
            {#if stage === LAST}
                <button class="nav-next go" on:click={confirmCareer} disabled={!canFinish}>Start Career</button>
            {:else}
                <button class="nav-next" on:click={next} disabled={!canNext}>Next</button>
            {/if}
        </footer>
    {/if}
</section>

<style>
    .cp { position: relative; flex: 1 0 auto; display: flex; flex-direction: column; width: 100%; max-width: 1440px; margin: 0 auto; padding: 0 20px; min-width: 0; }
    .cp-glow {
        position: fixed; inset: -20% -10% auto -10%; height: 70vh; pointer-events: none; z-index: 0; filter: blur(10px); opacity: 0.85;
        background:
            radial-gradient(60% 60% at 22% 0%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 70%),
            radial-gradient(50% 55% at 82% 6%, rgba(139, 92, 246, 0.14) 0%, transparent 72%);
    }
    .label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #334155; margin: 22px 0 10px; }

    /* --- INTRO --- */
    .intro { position: relative; z-index: 1; max-width: 880px; margin: 0 auto; padding: 72px 0 80px; text-align: center; animation: rise 0.5s ease both; }
    .intro-mark { font-size: 9px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #3f5069; margin-bottom: 18px; }
    .intro-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; display: flex; flex-direction: column; gap: 2px; align-items: center; line-height: 0.92; margin: 0 0 14px; }
    .intro-h1 { font-size: clamp(28px, 6vw, 54px); font-weight: 500; color: #6b7f9e; letter-spacing: -0.02em; }
    .intro-h2 {
        font-size: clamp(46px, 11vw, 104px); font-weight: 700; letter-spacing: -0.045em;
        background: linear-gradient(120deg, #e8eefb 0%, #a78bfa 52%, #7c5cf5 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .intro-tag { font-size: 11px; font-weight: 800; letter-spacing: 3.4px; text-transform: uppercase; color: #a78bfa; margin: 0 0 22px; }
    .intro-p { font-size: 14px; line-height: 1.75; color: #7d8ea9; max-width: 640px; margin: 0 auto 40px; }
    .pillars { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; text-align: left; margin-bottom: 40px; }
    .pillar { display: flex; gap: 14px; align-items: flex-start; padding: 18px; border-radius: 16px; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.34); }
    .pillar-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: rgba(139, 92, 246, 0.75); padding-top: 2px; }
    .pillar-body { min-width: 0; }
    .pillar-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 700; color: #e2e8f0; margin: 0 0 6px; }
    .pillar-d { font-size: 12px; line-height: 1.6; color: #64748b; margin: 0; }
    .intro-acts { display: flex; flex-direction: column; align-items: center; gap: 14px; }
    .big-cta {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
        color: #f5f3ff; padding: 16px 46px; border-radius: 14px; border: 1px solid rgba(167, 139, 250, 0.45); cursor: pointer;
        background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); box-shadow: 0 10px 34px rgba(139, 92, 246, 0.3);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .big-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 40px rgba(139, 92, 246, 0.45); }
    .quiet { font-family: inherit; font-size: 11px; font-weight: 700; letter-spacing: 0.6px; color: #56688a; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 8px; }
    .quiet:hover { color: #cbd5e1; background: rgba(51, 65, 85, 0.3); }
    .intro-note { font-size: 10px; color: #3f5069; margin: 26px 0 0; letter-spacing: 0.4px; }

    /* --- RAIL --- */
    .rail-wrap {
        position: sticky; top: 0; z-index: 20; margin: 0 -20px; padding: 12px 20px 8px;
        background: rgba(6, 9, 17, 0.92); backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%);
        border-bottom: 1px solid rgba(51, 65, 85, 0.28);
    }
    .rail-top { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
    .icon-btn { flex-shrink: 0; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; color: #64748b; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.35); cursor: pointer; }
    .icon-btn svg { width: 15px; height: 15px; }
    .icon-btn:hover { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.7); }
    .rail-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .rail-kicker { font-size: 8.5px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; color: #3f5069; }
    .rail-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; color: #e8eefb; letter-spacing: -0.01em; }
    .rail-count { margin-left: auto; white-space: nowrap; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: #a78bfa; }
    .rail-of { color: #3f5069; font-weight: 700; }
    .rail { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
    .rail::-webkit-scrollbar { display: none; }
    .rail-step { display: flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 9px; background: transparent; border: 1px solid transparent; font-family: inherit; font-size: 11px; font-weight: 700; color: #475569; white-space: nowrap; cursor: pointer; }
    .rail-step:disabled { cursor: default; opacity: 0.5; }
    .rail-step:not(:disabled):hover { color: #cbd5e1; background: rgba(51, 65, 85, 0.3); }
    .rs-n { width: 17px; height: 17px; border-radius: 5px; display: grid; place-items: center; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 800; background: rgba(51, 65, 85, 0.35); color: #64748b; }
    .rail-step.done { color: #7d8ea9; }
    .rail-step.done .rs-n { background: rgba(34, 197, 94, 0.16); color: #4ade80; }
    .rail-step.on { color: #c4b5fd; background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.28); }
    .rail-step.on .rs-n { background: rgba(139, 92, 246, 0.25); color: #ddd6fe; }

    /* --- BODY LAYOUT --- */
    .cp-body { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) 336px; gap: 26px; align-items: start; padding: 24px 0 20px; flex: 1; }
    .cp-main { min-width: 0; }
    .stagefade { animation: rise 0.3s ease both; }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .head { margin-bottom: 22px; }
    .h2 { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: clamp(21px, 3vw, 27px); font-weight: 700; letter-spacing: -0.025em; color: #e8eefb; margin: 0 0 8px; }
    .sub { font-size: 13px; line-height: 1.7; color: #6b7f9e; margin: 0; max-width: 660px; }
    .sub b { color: #cbd5e1; font-weight: 700; }
    .foot-note { font-size: 11px; line-height: 1.65; color: #475569; margin: 18px 0 0; max-width: 620px; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; }
    .chip { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9.5px; font-weight: 700; padding: 3px 7px; border-radius: 5px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 26%, transparent); }
    .chip b { font-weight: 800; margin-right: 3px; }
    .chip.neg { opacity: 0.6; }

    /* --- 1 PATH --- */
    .trade { display: flex; gap: 14px; align-items: flex-start; padding: 14px 16px; border-radius: 12px; margin-bottom: 18px; background: rgba(139, 92, 246, 0.07); border: 1px solid rgba(139, 92, 246, 0.2); }
    .trade-l { flex-shrink: 0; font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #a78bfa; padding-top: 2px; }
    .trade-p { font-size: 12px; line-height: 1.7; color: #7d8ea9; margin: 0; }
    .trade-p b { color: #e2e8f0; font-weight: 700; }
    .pathgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .pathcard {
        position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; text-align: left;
        padding: 22px 20px 18px; border-radius: 20px; cursor: pointer; font-family: inherit;
        background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.4);
        transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
    }
    .pathcard:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--a) 40%, transparent); }
    .pathcard.sel { border-color: color-mix(in srgb, var(--a) 60%, transparent); background: color-mix(in srgb, var(--a) 8%, rgba(12, 16, 28, 0.6)); box-shadow: 0 10px 34px color-mix(in srgb, var(--a) 14%, transparent); }
    .pc-stripe { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--a); opacity: 0.55; }
    .pc-top { display: flex; flex-direction: column; gap: 4px; }
    .pc-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 19px; font-weight: 700; color: #e8eefb; letter-spacing: -0.02em; }
    .pc-tag { font-size: 9.5px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: var(--a); }
    .pc-blurb { font-size: 12px; line-height: 1.7; color: #6b7f9e; }
    .pc-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .pcs { display: flex; flex-direction: column; gap: 3px; align-items: center; padding: 9px 4px; border-radius: 10px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.28); }
    .pcs-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 15px; font-weight: 800; color: #e2e8f0; }
    .pcs-l { font-size: 7.5px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #3f5069; text-align: center; }
    .pc-list { display: flex; flex-direction: column; gap: 6px; }
    .pl-h { font-size: 8.5px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; }
    .pl-h.good { color: #4ade80; }
    .pl-h.bad { color: #f87171; }
    .pl-row { display: flex; gap: 8px; font-size: 11.5px; line-height: 1.55; color: #7d8ea9; }
    .pl-i { flex-shrink: 0; width: 14px; height: 14px; margin-top: 1px; display: grid; place-items: center; border-radius: 4px; font-size: 10px; font-weight: 900; }
    .pl-i.good { color: #4ade80; background: rgba(34, 197, 94, 0.13); }
    .pl-i.bad { color: #f87171; background: rgba(239, 68, 68, 0.13); }
    .pc-pick { margin-top: auto; text-align: center; font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; padding: 10px; border-radius: 10px; color: var(--a); background: color-mix(in srgb, var(--a) 10%, transparent); border: 1px solid color-mix(in srgb, var(--a) 24%, transparent); }

    /* --- 2 AGE --- */
    .agegrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .agecard { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 22px 16px 18px; border-radius: 18px; cursor: pointer; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); font-family: inherit; text-align: center; transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease; }
    .agecard:hover { transform: translateY(-2px); border-color: rgba(167, 139, 250, 0.4); }
    .agecard.sel { border-color: rgba(167, 139, 250, 0.6); background: rgba(139, 92, 246, 0.09); box-shadow: 0 10px 30px rgba(139, 92, 246, 0.14); }
    .ac-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 40px; font-weight: 700; line-height: 1; color: #e8eefb; letter-spacing: -0.04em; }
    .ac-l { font-size: 8.5px; font-weight: 900; letter-spacing: 1.6px; text-transform: uppercase; color: #3f5069; margin-bottom: 8px; }
    .ac-rows { width: 100%; display: flex; flex-direction: column; gap: 4px; }
    .ac-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: 8px; background: rgba(15, 23, 42, 0.55); }
    .ac-k { font-size: 9px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #3f5069; }
    .ac-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; }
    .ac-v.pos { color: #4ade80; }
    .ac-v.neg { color: #fbbf24; }
    .ac-delta { font-size: 10.5px; line-height: 1.5; color: #56688a; margin-top: 8px; }

    /* --- 3 REGION --- */
    .regiongrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .regcard { display: flex; flex-direction: column; gap: 12px; text-align: left; padding: 18px; border-radius: 18px; cursor: pointer; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); font-family: inherit; transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease; }
    .regcard:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--a) 40%, transparent); }
    .regcard.sel { border-color: color-mix(in srgb, var(--a) 60%, transparent); background: color-mix(in srgb, var(--a) 8%, rgba(12, 16, 28, 0.6)); box-shadow: 0 10px 30px color-mix(in srgb, var(--a) 13%, transparent); }
    .rc-top { display: flex; align-items: center; gap: 11px; }
    .rc-flag { font-size: 24px; line-height: 1; }
    .rc-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .rc-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #e8eefb; }
    .rc-league { font-size: 9px; font-weight: 900; letter-spacing: 1.6px; color: var(--a); }
    .rc-train { margin-left: auto; white-space: nowrap; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 700; color: #56688a; padding: 3px 7px; border-radius: 5px; background: rgba(15, 23, 42, 0.6); }
    .rc-blurb { font-size: 11.5px; line-height: 1.65; color: #6b7f9e; }
    .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
    .metric { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .met-l { font-size: 7.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .met-bar { height: 3px; border-radius: 3px; background: rgba(148, 163, 184, 0.12); overflow: hidden; }
    .met-fill { display: block; height: 100%; border-radius: 3px; transition: width 0.3s ease; }

    /* --- 4 ROLE --- */
    .rolegrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; }
    .rolecard { display: flex; flex-direction: column; gap: 12px; text-align: left; padding: 18px; border-radius: 18px; cursor: pointer; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); font-family: inherit; transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease; }
    .rolecard:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--a) 40%, transparent); }
    .rolecard.sel { border-color: color-mix(in srgb, var(--a) 60%, transparent); background: color-mix(in srgb, var(--a) 8%, rgba(12, 16, 28, 0.6)); box-shadow: 0 10px 30px color-mix(in srgb, var(--a) 13%, transparent); }
    .ro-top { display: flex; align-items: center; gap: 12px; }
    .ro-ico { width: 34px; height: 34px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4)); }
    .ro-names { display: flex; flex-direction: column; gap: 2px; }
    .ro-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #e8eefb; }
    .ro-short { font-size: 9px; font-weight: 900; letter-spacing: 1.6px; text-transform: uppercase; color: var(--a); }
    .ro-blurb { font-size: 11.5px; line-height: 1.65; color: #6b7f9e; min-height: 38px; }
    .ro-weights { display: flex; flex-direction: column; gap: 4px; }
    .wt-h { font-size: 7.5px; font-weight: 900; letter-spacing: 1.3px; text-transform: uppercase; color: #334155; margin-bottom: 2px; }
    .wt-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; align-items: center; gap: 8px; opacity: 0.55; }
    .wt-row.key { opacity: 1; }
    .wt-abbr { font-size: 8.5px; font-weight: 900; letter-spacing: 0.8px; }
    .wt-bar { height: 3px; border-radius: 3px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
    .wt-fill { display: block; height: 100%; border-radius: 3px; }
    .wt-pct { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 700; color: #56688a; text-align: right; }

    /* --- 5 PLAYSTYLE --- */
    .stylegrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
    .stylecard { display: flex; flex-direction: column; gap: 11px; text-align: left; padding: 18px; border-radius: 18px; cursor: pointer; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); font-family: inherit; transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease; }
    .stylecard:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--a) 40%, transparent); }
    .stylecard.sel { border-color: color-mix(in srgb, var(--a) 60%, transparent); background: color-mix(in srgb, var(--a) 8%, rgba(12, 16, 28, 0.6)); box-shadow: 0 10px 30px color-mix(in srgb, var(--a) 13%, transparent); }
    .sc-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #e8eefb; }
    .sc-blurb { font-size: 11.5px; line-height: 1.65; color: #6b7f9e; min-height: 38px; }
    .bias { display: flex; flex-direction: column; gap: 5px; }
    .bias-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) 22px; align-items: center; gap: 8px; }
    .bias-l { font-size: 8px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #3f5069; }
    .bias-bar { height: 4px; border-radius: 3px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
    .bias-fill { display: block; height: 100%; border-radius: 3px; transition: width 0.25s ease; }
    .bias-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 700; color: #56688a; text-align: right; }
    .growth { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
    .gr-h { font-size: 7.5px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #334155; width: 100%; }
    .gr-chip { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 700; padding: 3px 6px; border-radius: 5px; color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c) 22%, transparent); }
    .gr-chip.down { opacity: 0.5; }

    /* --- 6 CHAMPION --- */
    .champbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .champ-search { flex: 1; min-width: 180px; max-width: 380px; }
    .champ-count { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .champdetail { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding: 12px 16px; border-radius: 12px; min-height: 46px; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.34); }
    .champdetail.empty { font-size: 11.5px; color: #475569; }
    .cd-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 700; color: #e8eefb; }
    .cd-arch { font-size: 9px; font-weight: 900; letter-spacing: 1.3px; text-transform: uppercase; color: #56688a; }
    .cwrap { display: flex; flex-wrap: wrap; gap: 8px; }
    .champscroll {
        max-height: min(46vh, 460px);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding-right: 6px;
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        /* The fade tells you there is more below without adding chrome. */
        -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent 100%);
        mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent 100%);
    }
    .champscroll::-webkit-scrollbar { width: 7px; }
    .champscroll::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.35); border-radius: 4px; }
    .champscroll::-webkit-scrollbar-track { background: transparent; }
    .cchip { display: flex; flex-direction: column; gap: 5px; align-items: flex-start; padding: 9px 12px; border-radius: 11px; cursor: pointer; font-family: inherit; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.34); transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease; }
    .cchip:hover { transform: translateY(-1px); border-color: rgba(167, 139, 250, 0.4); background: rgba(30, 41, 59, 0.6); }
    .cchip.sel { border-color: rgba(167, 139, 250, 0.65); background: rgba(139, 92, 246, 0.12); box-shadow: 0 6px 20px rgba(139, 92, 246, 0.16); }
    .cc-name { font-size: 12px; font-weight: 700; color: #cbd5e1; white-space: nowrap; }
    .cchip.sel .cc-name { color: #ede9fe; }
    .cc-mods { display: flex; gap: 5px; }
    .cc-mod { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 8.5px; font-weight: 700; color: var(--c); }
    .cc-mod.neg { opacity: 0.45; }
    .emptybox { padding: 30px; border-radius: 16px; text-align: center; background: rgba(12, 16, 28, 0.4); border: 1px dashed rgba(51, 65, 85, 0.4); color: #56688a; font-size: 12px; margin-top: 14px; }
    .emptybox p { margin: 0 0 10px; }

    /* --- 7 HANDLE --- */
    .handlebox { padding: 22px; border-radius: 18px; background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); }
    .hb-field { display: flex; gap: 10px; align-items: stretch; }
    .hb-input { flex: 1; min-width: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; padding: 14px 18px; border-radius: 14px; }
    .hb-rand { flex-shrink: 0; width: 54px; border-radius: 14px; cursor: pointer; font-size: 18px; color: #a78bfa; background: rgba(139, 92, 246, 0.12); border: 1px solid rgba(139, 92, 246, 0.3); }
    .hb-rand:hover { background: rgba(139, 92, 246, 0.2); }
    .hb-meta { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
    .hb-count { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 800; color: #475569; }
    .hb-count.warn { color: #fbbf24; }
    .hb-hint { font-size: 11px; color: #f87171; }
    .hb-ok { font-size: 11px; color: #4ade80; }
    .sumgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .sumcell { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; cursor: pointer; text-align: left; font-family: inherit; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.3); }
    .sumcell:disabled { cursor: default; }
    .sumcell:not(:disabled):hover { border-color: rgba(167, 139, 250, 0.4); background: rgba(30, 41, 59, 0.55); }
    .sum-k { font-size: 8px; font-weight: 900; letter-spacing: 1.3px; text-transform: uppercase; color: #334155; }
    .sum-v { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

    /* --- 8 CONFIRM --- */
    .finalcard { padding: 26px; border-radius: 22px; background: rgba(12, 16, 28, 0.55); border: 1px solid color-mix(in srgb, var(--tier) 30%, rgba(51, 65, 85, 0.4)); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.32); }
    .fc-head { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding-bottom: 20px; border-bottom: 1px solid rgba(51, 65, 85, 0.28); }
    .fc-ovr { flex-shrink: 0; width: 84px; height: 84px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 20px; background: color-mix(in srgb, var(--tier) 12%, rgba(15, 23, 42, 0.8)); border: 1px solid color-mix(in srgb, var(--tier) 42%, transparent); }
    .fc-ovr-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 38px; font-weight: 700; line-height: 1; color: var(--tier); }
    .fc-ovr-l { font-size: 8px; font-weight: 900; letter-spacing: 1.6px; color: #475569; margin-top: 4px; }
    .fc-id { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 6px; }
    .fc-handle { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fc-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 26px; font-weight: 700; letter-spacing: -0.025em; color: #e8eefb; }
    .fc-flag { font-size: 17px; }
    .fc-role { font-size: 9px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: var(--rc); background: color-mix(in srgb, var(--rc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--rc) 30%, transparent); }
    .fc-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; font-weight: 600; color: #56688a; }
    .fc-tier { color: var(--tier); font-weight: 800; letter-spacing: 0.4px; }
    .fc-dot { color: #2c3a52; }
    .fc-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: #475569; }
    .fc-pot { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding: 12px 16px; border-radius: 14px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.3); }
    .fc-pot-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 24px; font-weight: 800; color: #4ade80; line-height: 1; }
    .fc-pot-l { font-size: 8px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #3f5069; }
    .fc-pot-d { font-size: 9.5px; font-weight: 700; color: #56688a; margin-top: 3px; }
    .fc-attrs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 22px; padding: 20px 0; }
    .fa { min-width: 0; }
    .fa-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; gap: 8px; }
    .fa-name { font-size: 11px; font-weight: 800; letter-spacing: 0.3px; }
    .fa-nums { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .fa-v { color: #e2e8f0; }
    .fa-slash { color: #2c3a52; margin: 0 2px; }
    .fa-p { color: #4ade80; opacity: 0.8; }
    .fa-track { position: relative; height: 6px; border-radius: 4px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
    .fa-ghost { position: absolute; inset: 0 auto 0 0; opacity: 0.18; border-radius: 4px; }
    .fa-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; transition: width 0.3s ease; }
    .fa-cap { position: absolute; top: 0; bottom: 0; width: 2px; opacity: 0.7; }
    .start {
        display: block; width: 100%; margin-top: 6px; font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 14px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: #f5f3ff;
        padding: 16px; border-radius: 14px; cursor: pointer; background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
        border: 1px solid rgba(167, 139, 250, 0.45); box-shadow: 0 10px 30px rgba(139, 92, 246, 0.28);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .start:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 38px rgba(139, 92, 246, 0.42); }
    .start:disabled { opacity: 0.4; cursor: not-allowed; }
    .fc-note { font-size: 10px; line-height: 1.6; color: #3f5069; margin: 12px 0 0; text-align: center; }

    /* --- LIVE PREVIEW --- */
    .cp-preview { position: sticky; top: 108px; min-width: 0; }
    .pv { padding: 18px; border-radius: 20px; background: rgba(12, 16, 28, 0.62); border: 1px solid rgba(51, 65, 85, 0.4); backdrop-filter: blur(8px); box-shadow: 0 14px 40px rgba(0, 0, 0, 0.25); }
    .pv-head { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid rgba(51, 65, 85, 0.25); }
    .pv-ovr { position: relative; flex-shrink: 0; width: 62px; height: 62px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 16px; background: color-mix(in srgb, var(--tier) 12%, rgba(15, 23, 42, 0.8)); border: 1px solid color-mix(in srgb, var(--tier) 40%, transparent); }
    .pv-ovr-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 27px; font-weight: 700; line-height: 1; color: var(--tier); }
    .pv-ovr-l { font-size: 7px; font-weight: 900; letter-spacing: 1.5px; color: #475569; margin-top: 3px; }
    .pv-delta { position: absolute; top: -8px; right: -10px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 800; color: #052e16; padding: 2px 6px; border-radius: 6px; background: #4ade80; animation: pop 0.3s ease both; }
    .pv-delta.down { background: #f87171; color: #450a0a; }
    @keyframes pop { from { opacity: 0; transform: translateY(4px) scale(0.86); } to { opacity: 1; transform: none; } }
    .pv-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .pv-tier { font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: var(--tier); }
    .pv-label { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 700; color: #e8eefb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-pot { font-size: 10.5px; font-weight: 600; color: #56688a; }
    .pv-pot b { font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: #4ade80; font-weight: 800; }
    .pv-room { color: #3f5069; }
    .pv-empty { padding: 26px 6px; text-align: center; }
    .pv-empty p { font-size: 12px; line-height: 1.6; color: #56688a; margin: 0; }
    .pv-empty p.pv-empty-s { margin-top: 8px; font-size: 10.5px; color: #3f5069; }
    .pv-bars { display: flex; flex-direction: column; gap: 9px; padding: 14px 0 12px; }
    .pv-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 24px 20px; align-items: center; gap: 8px; }
    .pv-abbr { font-size: 8.5px; font-weight: 900; letter-spacing: 0.9px; }
    .pv-track { position: relative; display: block; height: 6px; border-radius: 4px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
    .pv-ghost { position: absolute; inset: 0 auto 0 0; opacity: 0.18; border-radius: 4px; transition: width 0.3s ease; }
    .pv-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; transition: width 0.3s ease; }
    .pv-cap { position: absolute; top: 0; bottom: 0; width: 2px; opacity: 0.65; transition: left 0.3s ease; }
    .pv-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 800; color: #e2e8f0; text-align: right; }
    .pv-p { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 700; color: #3f5069; text-align: right; }
    .pv-legend { display: flex; gap: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(51, 65, 85, 0.25); }
    .lg { display: flex; align-items: center; gap: 6px; font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .lg-s { width: 14px; height: 5px; border-radius: 3px; background: #94a3b8; }
    .lg-s.ghost { opacity: 0.22; }
    .pv-chips { display: flex; flex-wrap: wrap; gap: 5px; padding-top: 12px; }
    .pv-chip { font-size: 9.5px; font-weight: 700; padding: 3px 8px; border-radius: 6px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 24%, transparent); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-note { font-size: 10px; line-height: 1.55; color: #3f5069; margin: 12px 0 0; }

    /* --- FOOTER --- */
    .cp-foot {
        position: sticky; bottom: 0; z-index: 15; margin: 0 -20px; padding: 12px 20px; display: flex; align-items: center; gap: 14px;
        background: rgba(6, 9, 17, 0.92); backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%);
        border-top: 1px solid rgba(51, 65, 85, 0.28);
    }
    .nav-back { font-family: inherit; font-size: 12px; font-weight: 700; color: #64748b; padding: 11px 22px; border-radius: 11px; cursor: pointer; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.4); }
    .nav-back:hover { color: #e2e8f0; border-color: rgba(71, 85, 105, 0.7); }
    .foot-hint { flex: 1; text-align: center; font-size: 10px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: #334155; }
    .nav-next {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
        color: #f5f3ff; padding: 12px 30px; border-radius: 11px; cursor: pointer; background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
        border: 1px solid rgba(167, 139, 250, 0.45); box-shadow: 0 6px 20px rgba(139, 92, 246, 0.25); transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .nav-next:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(139, 92, 246, 0.4); }
    .nav-next:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
    .nav-next.go { background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-color: rgba(52, 211, 153, 0.5); box-shadow: 0 6px 20px rgba(16, 185, 129, 0.28); }
    .nav-next.go:hover:not(:disabled) { box-shadow: 0 10px 26px rgba(16, 185, 129, 0.42); }

    /* --- RESPONSIVE --- */
    @media (max-width: 1080px) {
        .cp-body { grid-template-columns: minmax(0, 1fr); gap: 18px; }
        .cp-preview { position: static; order: -1; }
        .pv { padding: 14px 16px; }
        .pv-bars { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
        .pv-chips { display: none; }
    }
    @media (max-width: 860px) {
        .pathgrid { grid-template-columns: minmax(0, 1fr); }
        .pillars { grid-template-columns: minmax(0, 1fr); }
        .fc-attrs { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 620px) {
        .cp { padding: 0 14px; }
        .rail-wrap, .cp-foot { margin: 0 -14px; padding-left: 14px; padding-right: 14px; }
        .intro { padding: 44px 0 60px; }
        .agegrid, .regiongrid, .rolegrid, .stylegrid { grid-template-columns: minmax(0, 1fr); }
        .pv-bars { grid-template-columns: minmax(0, 1fr); }
        .rs-l { display: none; }
        .rail-step { padding: 7px 9px; }
        .fc-head { gap: 12px; }
        .fc-pot { width: 100%; align-items: flex-start; }
        .fc-name { font-size: 21px; }
        .nav-next, .nav-back { padding: 11px 18px; }
        .foot-hint { display: none; }
        .hb-input { font-size: 18px; }
        .metrics { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 380px) {
        .pc-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .intro-h2 { font-size: 44px; }
    }
</style>
