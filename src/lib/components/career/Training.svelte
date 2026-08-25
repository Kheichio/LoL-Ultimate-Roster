<script>
    // =====================================================================
    //  LoL ULTIMATE CAREER - TRAINING
    // =====================================================================
    //  The only screen where attributes go up on purpose. Three layers:
    //    1. effectiveness  - why one session is worth what it is worth
    //    2. attributes     - where the points can still go
    //    3. drills         - the minigame that pays them out
    //  Everything numeric on this screen comes straight out of training.js so
    //  the preview the player reads is the same maths that runs on completion.
    // =====================================================================

    import { onDestroy } from 'svelte';

    import {
        career, careerScreen, careerOVR, saveCareer,
    } from '../../stores/career.js';
    import {
        ATTRS, ROLE_BY_ID, ATTR_MAX, UNSIGNED_SOFT_CAP, ENERGY_MAX,
    } from '../../career/constants.js';
    import {
        DRILLS, DRILL_TIERS, drillsForAttr, expectedGain, canTrain, runDrill,
        trainingMultiplier, trainingMultiplierBreakdown, weeklyTrainingSlots,
        trainingOverview, trainingBlurb, completeDrill,
    } from '../../career/training.js';
    import { energyLabel, fmtGold, clamp } from '../../career/ratings.js';
    import { unsignedCapFor } from '../../career/economy.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    import MinigameHost from './minigames/MinigameHost.svelte';

    const BOLT = '\u26A1';
    const COIN = '\u{1F4B0}';
    const ARROW = '\u2192';

    // Colour per coach-feedback band, used to tint the whole result panel.
    const BAND_COLOR = {
        elite: '#eab308',
        sharp: '#22c55e',
        solid: '#3b82f6',
        sloppy: '#f59e0b',
        wasted: '#ef4444',
    };

    // ---------------------------------------------------------------- state
    let activeDrill = null;      // drill currently being played in MinigameHost
    let result = null;           // completeDrill() payload for the result panel
    let lastScore = 0;
    let lastMeta = {};
    let lastDrillName = '';
    let flashAttr = '';
    let flashTimer = null;

    function highestWeightAttr(roleId) {
        const role = ROLE_BY_ID[roleId] || ROLE_BY_ID.MID;
        let best = ATTRS[0].key;
        let bestW = -1;
        for (const a of ATTRS) {
            const w = role.weights[a.key] || 0;
            if (w > bestW) { bestW = w; best = a.key; }
        }
        return best;
    }

    // Open on whatever the player's role actually cares about most.
    let selectedAttr = highestWeightAttr($career.player.role);

    onDestroy(() => { if (flashTimer) clearTimeout(flashTimer); flashTimer = null; });

    // ---------------------------------------------------------------- derived
    $: c = $career;
    $: p = c.player;
    $: role = ROLE_BY_ID[p.role] || ROLE_BY_ID.MID;

    $: mult = trainingMultiplier(c);
    $: breakdown = trainingMultiplierBreakdown(c);
    $: slots = weeklyTrainingSlots(c);
    $: slotsUnlimited = !Number.isFinite(slots.max);
    $: slotsFull = !slotsUnlimited && slots.used >= slots.max;

    $: overview = trainingOverview(c);
    $: energy = Math.round(p.energy || 0);
    $: energyInfo = energyLabel(energy);

    $: actionsLeft = c.weekly.actionsLeft || 0;
    $: actionsMax = c.weekly.actionsMax || 0;

    $: throttled = overview.filter(a => a.throttled);
    $: maxedOut = overview.filter(a => a.headroom <= 0);
    $: unsigned = !p.clubId;
    // Not the constant: the Self-Made legacy perk moves this player's own cap,
    // so the screen has to ask rather than quote.
    $: unsignedCap = Math.round(unsignedCapFor(c));

    $: selectedRow = overview.find(a => a.key === selectedAttr) || null;
    $: selectedDrills = selectedAttr ? drillsForAttr(selectedAttr) : [];
    $: drillRows = selectedDrills.map(d => {
        const gain = expectedGain(c, d);
        const gate = canTrain(c, d);
        const cost = runDrill(c, d, 0.5);
        return {
            d,
            gain,
            gate,
            energyCost: cost.energyCost,
            risk: cost.injuryRisk,
            tier: DRILL_TIERS[d.difficulty] || DRILL_TIERS[1],
            locked: $careerOVR < d.reqOVR,
        };
    });

    // ---- week log ------------------------------------------------------
    // logWeek() writes a drill's own name as the entry label, so matching the
    // drill table is a reliable way to pull training out of a mixed week log.
    const DRILL_NAMES = new Set(DRILLS.map(d => d.name));
    $: weekLog = Array.isArray(c.weekly.log) ? c.weekly.log : [];
    $: sessionLog = weekLog.filter(e => e && DRILL_NAMES.has(e.label)).slice(-5).reverse();
    $: trainedMap = (c.weekly && c.weekly.trained) || {};
    $: trainedChips = ATTRS
        .filter(a => (trainedMap[a.key] || 0) > 0)
        .map(a => ({ key: a.key, abbr: a.abbr, name: a.name, color: a.color, n: trainedMap[a.key] }));
    $: sessionsThisWeek = trainedChips.reduce((s, x) => s + x.n, 0);

    // ---------------------------------------------------------------- helpers
    function pct(v) { return clamp((Number(v) || 0) / ATTR_MAX * 100, 0, 100); }

    function fmtNum(n) {
        const v = Number(n) || 0;
        return String(Math.round(v * 100) / 100);
    }

    function multColor(m) {
        if (m >= 1.45) return '#22c55e';
        if (m >= 1.12) return '#a78bfa';
        if (m >= 0.95) return '#94a3b8';
        if (m >= 0.75) return '#f59e0b';
        return '#ef4444';
    }

    function rowColor(m) {
        if (m > 1.02) return '#4ade80';
        if (m < 0.98) return '#fb923c';
        return '#64748b';
    }

    function weightPct(key) {
        return Math.round((role.weights[key] || 0) * 100);
    }

    function selectAttr(key) {
        playSound('click');
        selectedAttr = selectedAttr === key ? '' : key;
    }

    function flash(key) {
        if (flashTimer) clearTimeout(flashTimer);
        flashAttr = key;
        flashTimer = setTimeout(() => { flashAttr = ''; flashTimer = null; }, 1700);
    }

    function goto(screen) {
        playSound('click');
        careerScreen.set(screen);
    }

    // ---------------------------------------------------------------- drills
    function start(d) {
        const gate = canTrain(c, d);
        if (!gate.ok) {
            playSound('click');
            showToast(gate.reason, 'error');
            return;
        }
        playSound('click');
        result = null;
        lastMeta = {};
        lastDrillName = d.name;
        activeDrill = d;
    }

    function handleComplete(score01, meta) {
        const d = activeDrill;
        activeDrill = null;
        if (!d) return;

        const score = clamp(score01, 0, 1);
        const res = completeDrill(d, score);

        lastScore = score;
        lastMeta = meta || {};
        lastDrillName = d.name;
        result = res;

        if (res.ok) {
            selectedAttr = d.attr;
            flash(d.attr);
            playSound(score >= 0.65 ? 'win' : 'claim');
        } else {
            showToast(res.message || 'That session could not be run.', 'error');
        }
        saveCareer();
    }

    function quitDrill() {
        activeDrill = null;
    }

    function closeResult() {
        result = null;
        lastMeta = {};
        playSound('click');
        saveCareer();
    }

    function onWindowKey(e) {
        if (!result) return;
        if (e.key === 'Escape' || e.key === 'Esc' || e.key === 'Enter') {
            e.preventDefault();
            closeResult();
        }
    }

    // ---- result-panel derived ------------------------------------------
    $: resBand = result && result.band ? result.band : 'solid';
    $: resColor = BAND_COLOR[resBand] || '#3b82f6';
    $: resPct = Math.round(clamp(lastScore, 0, 1) * 100);
    $: resDetail = lastMeta && typeof lastMeta.detail === 'string' ? lastMeta.detail : '';
    $: coachLine = result ? (result.blurb || trainingBlurb(lastScore)) : '';
</script>

<svelte:window on:keydown={onWindowKey} />

<section class="tr">

    <!-- ============================ HEADER ============================ -->
    <div class="tr-top">
        <div>
            <h2 class="tr-h">Training</h2>
            <p class="tr-sub">
                Drills are the only place your attributes rise on purpose. Everything in the
                effectiveness panel multiplies what a single session is worth.
            </p>
        </div>
        <div class="tr-role" style="--rc:{role.accent}">
            <span class="tr-role-l">Rated as</span>
            <span class="tr-role-n">{role.name}</span>
        </div>
    </div>

    <!-- ======================= EFFECTIVENESS ========================= -->
    <div class="eff">
        <div class="eff-main">
            <div class="side-label">Training Effectiveness</div>

            <div class="eff-head">
                <div class="eff-big" style="color:{multColor(mult)}">
                    {mult.toFixed(2)}<span class="eff-x">x</span>
                </div>
                <p class="eff-note">
                    Every point a drill would pay out is multiplied by this before the
                    potential ceiling gets its say. Each factor below stacks.
                </p>
            </div>

            <ul class="fac">
                {#each breakdown as row (row.key)}
                    <li class="fac-row">
                        <span class="fac-key">{row.label}</span>
                        <span class="fac-note">{row.note}</span>
                        <span class="fac-bar" aria-hidden="true">
                            <span
                                class="fac-fill"
                                class:fac-down={row.mult < 1}
                                style="width:{clamp(Math.abs(row.mult - 1) * 220, 3, 100)}%; background:{rowColor(row.mult)}"
                            ></span>
                        </span>
                        <span class="fac-val" style="color:{rowColor(row.mult)}">{row.mult.toFixed(2)}x</span>
                    </li>
                {/each}
                <li class="fac-row fac-total">
                    <span class="fac-key">Total</span>
                    <span class="fac-note">All factors multiplied</span>
                    <span class="fac-bar" aria-hidden="true"></span>
                    <span class="fac-val" style="color:{multColor(mult)}">{mult.toFixed(2)}x</span>
                </li>
            </ul>

            <button class="eff-link" on:click={() => goto('shop')}>
                Gear, lifestyle and staff are bought in the Shop {ARROW}
            </button>
        </div>

        <div class="eff-side">
            <div class="side-label">This Week</div>

            <div class="tile">
                <div class="tile-top">
                    <span class="tile-l">Activity slots</span>
                    <span class="tile-v" style="color:{actionsLeft > 0 ? '#a78bfa' : '#ef4444'}">
                        {actionsLeft}<span class="tile-of">/ {actionsMax}</span>
                    </span>
                </div>
                <div class="tile-bar">
                    <div class="tile-fill" style="width:{actionsMax ? (actionsLeft / actionsMax) * 100 : 0}%; background:#a78bfa"></div>
                </div>
                <p class="tile-p">Every drill costs one slot, same as any other weekly activity.</p>
            </div>

            <div class="tile">
                <div class="tile-top">
                    <span class="tile-l">Club sessions</span>
                    <span class="tile-v" style="color:{slotsFull ? '#f59e0b' : '#38bdf8'}">
                        {slots.used}<span class="tile-of">/ {slotsUnlimited ? 'Unlimited' : slots.max}</span>
                    </span>
                </div>
                <div class="tile-bar">
                    <div
                        class="tile-fill"
                        style="width:{slotsUnlimited ? 100 : clamp((slots.used / slots.max) * 100, 0, 100)}%; background:{slotsUnlimited ? 'rgba(56,189,248,0.35)' : '#38bdf8'}"
                    ></div>
                </div>
                <p class="tile-p">
                    {#if slotsUnlimited}
                        Unsigned, so nobody schedules your week. Slots are your only limit.
                    {:else}
                        Your club books the practice block. A better club books more of them.
                    {/if}
                </p>
            </div>

            <div class="tile">
                <div class="tile-top">
                    <span class="tile-l">Energy</span>
                    <span class="tile-v" style="color:{energyInfo.color}">
                        {energy}<span class="tile-of">{energyInfo.name}</span>
                    </span>
                </div>
                <div class="tile-bar">
                    <div class="tile-fill" style="width:{clamp((energy / ENERGY_MAX) * 100, 0, 100)}%; background:{energyInfo.color}"></div>
                    <div class="tile-mark" style="left:25%" title="Below 25 energy every gain is halved"></div>
                </div>
                <p class="tile-p">The marker at 25 is the cliff. Below it, training pays half.</p>
            </div>
        </div>
    </div>

    <!-- ========================== WARNINGS =========================== -->
    <div class="warns">
        {#if energy < 25}
            <div class="warn warn-bad">
                <span class="warn-ico" aria-hidden="true">{BOLT}</span>
                <span class="warn-t">
                    <strong>Exhausted.</strong> Below 25 energy every drill pays half of what it should,
                    and the injury roll is at its worst. Rest first - the week is not going anywhere.
                </span>
            </div>
        {:else if energy < 40}
            <div class="warn warn-warn">
                <span class="warn-ico" aria-hidden="true">{BOLT}</span>
                <span class="warn-t">
                    <strong>Running low.</strong> Under 40 energy the injury chance on every drill climbs,
                    and at 25 gains are halved outright.
                </span>
            </div>
        {/if}

        {#if throttled.length}
            <div class="warn warn-warn">
                <span class="warn-ico" aria-hidden="true">&#x1F512;</span>
                <span class="warn-t">
                    <strong>{throttled.length} attribute{throttled.length === 1 ? '' : 's'} past the unsigned ceiling of {unsignedCap}.</strong>
                    {throttled.map(a => a.abbr).join(', ')} still move, at roughly a seventh of the
                    normal rate. Training alone gets you scouted; it does not get you good. Sign for a club.
                </span>
                <button class="warn-btn" on:click={() => goto('transfers')}>Transfers</button>
            </div>
        {:else if unsigned}
            <div class="warn warn-info">
                <span class="warn-ico" aria-hidden="true">&#x2139;</span>
                <span class="warn-t">
                    <strong>Unsigned.</strong> Training alone runs at 0.9x, and past {unsignedCap} every
                    attribute crawls. Good enough to get scouted, never good enough to be great.
                </span>
            </div>
        {/if}

        {#if slotsFull}
            <div class="warn warn-info">
                <span class="warn-ico" aria-hidden="true">&#x1F4C5;</span>
                <span class="warn-t">
                    <strong>Practice block is full.</strong> Your club schedules {slots.max} session{slots.max === 1 ? '' : 's'} a
                    week at this tier. Anything else this week has to be scrims, solo queue or rest.
                </span>
            </div>
        {:else if actionsLeft <= 0}
            <div class="warn warn-info">
                <span class="warn-ico" aria-hidden="true">&#x1F4C5;</span>
                <span class="warn-t">
                    <strong>No activity slots left.</strong> The week is spent. Advance it from the calendar
                    to get your slots and energy back.
                </span>
                <button class="warn-btn" on:click={() => goto('calendar')}>Calendar</button>
            </div>
        {/if}
    </div>

    <!-- ======================= WEEK LOG STRIP ======================== -->
    <div class="strip">
        <div class="strip-head">
            <span class="side-label strip-l">Last Five Sessions</span>
            <span class="strip-ct">{sessionsThisWeek} this week</span>
            {#if trainedChips.length}
                <span class="strip-chips">
                    {#each trainedChips as ch (ch.key)}
                        <span class="chip" style="--cc:{ch.color}" title="{ch.name}: {ch.n} session{ch.n === 1 ? '' : 's'} this week">
                            {ch.abbr}<span class="chip-n">x{ch.n}</span>
                        </span>
                    {/each}
                </span>
            {/if}
        </div>

        {#if sessionLog.length}
            <div class="strip-scroll">
                <div class="strip-row">
                    {#each sessionLog as e (e.id)}
                        <div class="sess" style="--sc:{e.accent || '#3b82f6'}">
                            <span class="sess-dot" aria-hidden="true"></span>
                            <span class="sess-name" title={e.label}>{e.label}</span>
                            <span class="sess-detail" title={e.detail}>{e.detail}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {:else}
            <p class="strip-empty">
                Nothing logged yet this week. Every drill you finish lands here, so you can see
                a week's worth of work at a glance instead of guessing.
            </p>
        {/if}
    </div>

    <!-- ========================= ATTRIBUTES ========================== -->
    <div class="side-label attr-title">
        Attributes
        <span class="attr-title-n">{maxedOut.length} of {ATTRS.length} at ceiling</span>
    </div>

    <div class="attrs">
        {#each overview as a (a.key)}
            {@const open = selectedAttr === a.key}
            {@const w = weightPct(a.key)}
            <div class="attr" class:attr-open={open} class:attr-flash={flashAttr === a.key} style="--ac:{a.color}">
                <button
                    class="attr-head"
                    on:click={() => selectAttr(a.key)}
                    aria-expanded={open}
                    aria-controls={'drills-' + a.key}
                >
                    <span class="attr-abbr">{a.abbr}</span>

                    <span class="attr-main">
                        <span class="attr-line">
                            <span class="attr-name">{a.name}</span>
                            {#if a.headroom <= 0}
                                <span class="tag tag-max">Maxed</span>
                            {:else if a.throttled}
                                <span class="tag tag-cap">Unsigned cap</span>
                            {/if}
                            {#if a.trainedThisWeek > 0}
                                <span class="tag tag-rep">{a.trainedThisWeek} this week</span>
                            {/if}
                        </span>
                        <span class="attr-desc">{a.desc}</span>
                        <span class="attr-bar">
                            <span class="bar-ghost" style="width:{pct(a.ceiling)}%"></span>
                            <span class="bar-fill" style="width:{pct(a.value)}%"></span>
                        </span>
                    </span>

                    <span class="attr-nums" title="Current value and your potential ceiling">
                        <span class="attr-cur">{Math.round(a.value)}</span>
                        <span class="attr-slash">/</span>
                        <span class="attr-pot">{Math.round(a.ceiling)}</span>
                    </span>

                    <span
                        class="attr-w"
                        class:attr-w-key={w >= 16}
                        title="{a.name} is {w}% of a {role.short}'s overall rating"
                    >
                        <span class="attr-w-n">{w}%</span>
                        <span class="attr-w-l">of OVR</span>
                    </span>

                    <span class="attr-chev" aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 6l4 4 4-4" />
                        </svg>
                    </span>
                </button>

                {#if open}
                    <div class="drills" id={'drills-' + a.key}>
                        {#if selectedRow && selectedRow.headroom <= 0}
                            <p class="drills-note">
                                {a.name} is at your ceiling of {Math.round(a.ceiling)}. No drill moves it
                                again - but the ceiling itself is not fixed. A breakthrough split, the
                                Evergreen legacy perk or a performance camp all raise it.
                            </p>
                        {/if}

                        <div class="drill-grid">
                            {#each drillRows as row (row.d.id)}
                                <article class="drill" class:drill-off={!row.gate.ok} style="--dc:{row.tier.accent}">
                                    <header class="drill-head">
                                        <span class="drill-tier">{row.tier.name}</span>
                                        <span class="pips" role="img" aria-label={'Difficulty ' + row.d.difficulty + ' of 3'}>
                                            <span class="pip" class:on={row.d.difficulty >= 1}></span>
                                            <span class="pip" class:on={row.d.difficulty >= 2}></span>
                                            <span class="pip" class:on={row.d.difficulty >= 3}></span>
                                        </span>
                                    </header>

                                    <h4 class="drill-name">{row.d.name}</h4>
                                    <p class="drill-desc">{row.d.desc}</p>

                                    <dl class="drill-stats">
                                        <div class="ds">
                                            <dt>Energy</dt>
                                            <dd class:ds-bad={energy < row.energyCost}>{BOLT} {row.energyCost}</dd>
                                        </div>
                                        <div class="ds">
                                            <dt>Fee</dt>
                                            <dd class:ds-bad={row.d.goldCost > 0 && c.money.gold < row.d.goldCost}>
                                                {row.d.goldCost > 0 ? COIN + ' ' + fmtGold(row.d.goldCost) : 'Free'}
                                            </dd>
                                        </div>
                                        <div class="ds">
                                            <dt>Requires</dt>
                                            <dd class:ds-bad={row.locked}>
                                                {row.d.reqOVR > 0 ? row.d.reqOVR + ' OVR' : 'Open'}
                                            </dd>
                                        </div>
                                        <div class="ds">
                                            <dt>Risk</dt>
                                            <dd>{Math.round(row.risk * 100)}%</dd>
                                        </div>
                                    </dl>

                                    <div class="gain" class:gain-capped={row.gain.capped}>
                                        <span class="gain-l">Expected gain</span>
                                        <span class="gain-v">
                                            {#if row.gain.capped}
                                                Ceiling reached
                                            {:else}
                                                +{row.gain.min.toFixed(2)} to +{row.gain.max.toFixed(2)}
                                            {/if}
                                        </span>
                                        <span class="gain-sub">
                                            {#if row.gain.capped}
                                                Tops out at {Math.min(row.d.attrCap, Math.round(a.ceiling))}
                                            {:else}
                                                bad session {ARROW} perfect run
                                            {/if}
                                        </span>
                                    </div>

                                    <button
                                        class="drill-go"
                                        disabled={!row.gate.ok}
                                        on:click={() => start(row.d)}
                                        aria-label={'Start ' + row.d.name}
                                    >
                                        {row.gate.ok ? 'Start Drill' : 'Unavailable'}
                                    </button>

                                    {#if !row.gate.ok}
                                        <p class="drill-block">{row.gate.reason}</p>
                                    {/if}
                                </article>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</section>

<!-- =========================== MINIGAME =========================== -->
{#if activeDrill}
    <MinigameHost
        drill={{ ...activeDrill, difficulty: activeDrill.difficulty }}
        onComplete={handleComplete}
        onQuit={quitDrill}
    />
{/if}

<!-- ============================ RESULT ============================ -->
{#if result}
    <div class="res-over" role="dialog" aria-modal="true" aria-label="Training session result">
        <div class="res-bg" aria-hidden="true"></div>
        <div class="res" style="--rc:{result.ok ? resColor : '#ef4444'}">

            {#if result.ok}
                <div class="res-head">
                    <div class="ring" style="--p:{resPct}">
                        <span class="ring-in">
                            <span class="ring-n">{resPct}</span>
                            <span class="ring-u">%</span>
                        </span>
                    </div>
                    <div class="res-id">
                        <div class="side-label">Session complete</div>
                        <h3 class="res-name">{lastDrillName}</h3>
                        <p class="res-attr">{result.attrName}</p>
                    </div>
                </div>

                {#if resDetail}
                    <p class="res-detail">{resDetail}</p>
                {/if}

                <blockquote class="res-coach">
                    <span class="res-coach-l">Coach</span>
                    {coachLine}
                </blockquote>

                <div class="res-rows">
                    <div class="res-row">
                        <span class="rr-l">{result.attrName}</span>
                        <span class="rr-v" style="color:{result.gain > 0 ? '#4ade80' : '#64748b'}">
                            {result.gain > 0 ? '+' + fmtNum(result.gain) : 'no measurable gain'}
                        </span>
                    </div>

                    <div class="res-row">
                        <span class="rr-l">Overall rating</span>
                        {#if result.levelUp}
                            <span class="rr-v rr-up">{result.ovrBefore} {ARROW} {result.ovrAfter}</span>
                        {:else}
                            <span class="rr-v rr-flat">{result.ovrAfter} - unchanged</span>
                        {/if}
                    </div>

                    <div class="res-row">
                        <span class="rr-l">Energy spent</span>
                        <span class="rr-v rr-flat">{BOLT} {result.energyCost}</span>
                    </div>

                    {#if result.goldSpent > 0}
                        <div class="res-row">
                            <span class="rr-l">Drill fee</span>
                            <span class="rr-v rr-flat">{COIN} {fmtGold(result.goldSpent)}</span>
                        </div>
                    {/if}
                </div>

                {#if result.injured}
                    <div class="res-injury">
                        <strong>Knock picked up.</strong> Health down {result.healthLost} and your form
                        took a hit with it. Rest or get it looked at before the next heavy session.
                    </div>
                {:else if result.levelUp}
                    <div class="res-up">
                        <strong>Overall rating up.</strong> That session moved the number people
                        actually judge you on.
                    </div>
                {/if}
            {:else}
                <div class="res-head res-head-fail">
                    <div class="res-id">
                        <div class="side-label">Session not run</div>
                        <h3 class="res-name">{lastDrillName}</h3>
                    </div>
                </div>
                <p class="res-detail">{result.message}</p>
                <p class="res-fine">Nothing was spent - no slot, no energy, no gold.</p>
            {/if}

            <!-- svelte-ignore a11y-autofocus -->
            <button class="res-done" on:click={closeResult} autofocus>Done</button>
        </div>
    </div>
{/if}

<style>
    .tr { max-width: 1200px; margin: 0 auto; padding-bottom: 40px; }

    .side-label {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px;
        color: #334155; margin-bottom: 10px;
    }

    /* ---------------- header ---------------- */
    .tr-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
    .tr-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; font-weight: 900; color: #e8eefb; letter-spacing: -0.01em; }
    .tr-sub { font-size: 12px; color: #64748b; margin-top: 3px; max-width: 560px; line-height: 1.6; }
    .tr-role {
        display: flex; flex-direction: column; gap: 2px; align-items: flex-end;
        padding: 8px 14px; border-radius: 12px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid color-mix(in srgb, var(--rc) 26%, transparent);
    }
    .tr-role-l { font-size: 8px; font-weight: 900; letter-spacing: 1.3px; text-transform: uppercase; color: #3f5069; }
    .tr-role-n { font-size: 13px; font-weight: 800; color: var(--rc); }

    /* ---------------- effectiveness ---------------- */
    .eff { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; margin-bottom: 16px; }
    .eff-main, .eff-side {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 18px; padding: 18px;
    }
    .eff-main { border-color: rgba(139, 92, 246, 0.2); }

    .eff-head { display: flex; align-items: center; gap: 18px; margin-bottom: 16px; flex-wrap: wrap; }
    .eff-big {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 46px; font-weight: 800; line-height: 1; letter-spacing: -0.03em;
    }
    .eff-x { font-size: 20px; opacity: 0.55; margin-left: 2px; }
    .eff-note { flex: 1; min-width: 200px; font-size: 11.5px; line-height: 1.65; color: #64748b; }

    .fac { display: flex; flex-direction: column; gap: 2px; }
    .fac-row {
        display: grid;
        grid-template-columns: minmax(84px, 130px) minmax(0, 1fr) 76px 56px;
        align-items: center; gap: 10px;
        padding: 7px 8px; border-radius: 8px;
    }
    .fac-row:nth-child(odd) { background: rgba(148, 163, 184, 0.035); }
    .fac-key { font-size: 11.5px; font-weight: 800; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fac-note { font-size: 10.5px; color: #4a5b76; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fac-bar { height: 3px; border-radius: 3px; background: rgba(148, 163, 184, 0.1); position: relative; overflow: hidden; }
    .fac-fill { position: absolute; top: 0; left: 50%; height: 100%; border-radius: 3px; }
    .fac-fill.fac-down { left: auto; right: 50%; }
    .fac-val { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; text-align: right; }
    .fac-total { margin-top: 6px; border-top: 1px solid rgba(51, 65, 85, 0.3); border-radius: 0; background: none !important; padding-top: 11px; }
    .fac-total .fac-key { color: #e2e8f0; text-transform: uppercase; font-size: 10px; letter-spacing: 1.2px; }
    .fac-total .fac-val { font-size: 14px; }

    .eff-link {
        margin-top: 14px; padding: 0; background: none; border: none; cursor: pointer;
        font-family: inherit; font-size: 11px; font-weight: 700; color: #7c6bb0;
    }
    .eff-link:hover { color: #a78bfa; }

    /* ---------------- tiles ---------------- */
    .tile { padding: 11px 0 12px; border-bottom: 1px solid rgba(51, 65, 85, 0.18); }
    .tile:last-child { border-bottom: none; padding-bottom: 2px; }
    .tile-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 7px; }
    .tile-l { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #3f5069; }
    .tile-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 16px; font-weight: 800; }
    .tile-of { font-size: 10px; font-weight: 700; color: #475569; margin-left: 5px; font-family: inherit; }
    .tile-bar { position: relative; height: 4px; border-radius: 4px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
    .tile-fill { height: 100%; border-radius: 4px; transition: width 0.25s ease; }
    .tile-mark { position: absolute; top: -2px; width: 1px; height: 8px; background: rgba(226, 232, 240, 0.45); }
    .tile-p { font-size: 10.5px; line-height: 1.55; color: #4a5b76; margin-top: 7px; }

    /* ---------------- warnings ---------------- */
    .warns { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .warn {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 10px 14px; border-radius: 12px;
        font-size: 11.5px; line-height: 1.6; color: #94a3b8;
    }
    .warn-ico { font-size: 13px; flex-shrink: 0; }
    .warn-t { flex: 1; min-width: 180px; }
    .warn strong { font-weight: 800; }
    .warn-bad { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); }
    .warn-bad strong { color: #f87171; }
    .warn-warn { background: rgba(245, 158, 11, 0.07); border: 1px solid rgba(245, 158, 11, 0.22); }
    .warn-warn strong { color: #fbbf24; }
    .warn-info { background: rgba(56, 189, 248, 0.06); border: 1px solid rgba(56, 189, 248, 0.18); }
    .warn-info strong { color: #7dd3fc; }
    .warn-btn {
        flex-shrink: 0; padding: 5px 12px; border-radius: 8px; cursor: pointer;
        background: rgba(139, 92, 246, 0.14); border: 1px solid rgba(139, 92, 246, 0.3);
        color: #c4b5fd; font-family: inherit; font-size: 10px; font-weight: 800;
        letter-spacing: 0.6px; text-transform: uppercase;
    }
    .warn-btn:hover { background: rgba(139, 92, 246, 0.24); }

    /* ---------------- week strip ---------------- */
    .strip {
        background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.24);
        border-radius: 16px; padding: 14px 16px; margin-bottom: 20px;
    }
    .strip-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .strip-l { margin-bottom: 0; }
    .strip-ct { font-size: 10px; font-weight: 800; color: #475569; letter-spacing: 0.5px; }
    .strip-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-left: auto; }
    .chip {
        display: inline-flex; align-items: baseline; gap: 4px;
        padding: 3px 7px; border-radius: 6px;
        font-size: 9px; font-weight: 900; letter-spacing: 0.8px;
        color: var(--cc);
        background: color-mix(in srgb, var(--cc) 11%, transparent);
        border: 1px solid color-mix(in srgb, var(--cc) 26%, transparent);
    }
    .chip-n { font-size: 8.5px; opacity: 0.75; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }

    .strip-scroll { overflow-x: auto; margin-top: 12px; padding-bottom: 2px; }
    .strip-row { display: flex; gap: 8px; min-width: min-content; }
    .sess {
        flex: 0 0 auto; width: 176px;
        display: flex; flex-direction: column; gap: 3px;
        padding: 9px 11px; border-radius: 10px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.22);
        border-left: 2px solid var(--sc);
    }
    .sess-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--sc); }
    .sess-name { font-size: 11px; font-weight: 800; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sess-detail { font-size: 10px; color: #4a5b76; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .strip-empty { font-size: 11.5px; line-height: 1.6; color: #475569; margin-top: 10px; max-width: 620px; }

    /* ---------------- attributes ---------------- */
    .attr-title { display: flex; align-items: baseline; gap: 10px; }
    .attr-title-n { font-size: 9px; font-weight: 800; letter-spacing: 0.8px; color: #2c3a52; }
    .attrs { display: flex; flex-direction: column; gap: 8px; }

    .attr {
        border-radius: 14px; overflow: hidden;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.24);
        transition: border-color 0.15s ease;
    }
    .attr-open { border-color: color-mix(in srgb, var(--ac) 32%, transparent); }
    .attr-flash { animation: attrFlash 1.7s ease-out; }
    @keyframes attrFlash {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ac) 55%, transparent); }
        100% { box-shadow: 0 0 0 14px rgba(0, 0, 0, 0); }
    }

    .attr-head {
        width: 100%; display: grid;
        grid-template-columns: 46px minmax(0, 1fr) auto auto 22px;
        align-items: center; gap: 14px;
        padding: 12px 14px; text-align: left;
        background: none; border: none; cursor: pointer; font-family: inherit;
    }
    .attr-head:hover { background: rgba(148, 163, 184, 0.04); }
    .attr-head:focus-visible { outline: 2px solid var(--ac); outline-offset: -2px; }

    .attr-abbr {
        display: grid; place-items: center; height: 30px; border-radius: 8px;
        font-size: 10px; font-weight: 900; letter-spacing: 1px;
        color: var(--ac);
        background: color-mix(in srgb, var(--ac) 11%, transparent);
        border: 1px solid color-mix(in srgb, var(--ac) 26%, transparent);
    }
    .attr-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .attr-line { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .attr-name { font-size: 13.5px; font-weight: 800; color: #e2e8f0; }
    .tag {
        font-size: 8px; font-weight: 900; letter-spacing: 0.9px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 5px;
    }
    .tag-max { color: #4ade80; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25); }
    .tag-cap { color: #fbbf24; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); }
    .tag-rep { color: #94a3b8; background: rgba(148, 163, 184, 0.09); border: 1px solid rgba(148, 163, 184, 0.16); }
    .attr-desc {
        font-size: 10.5px; line-height: 1.5; color: #4a5b76;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .attr-bar { position: relative; display: block; height: 5px; border-radius: 5px; background: rgba(148, 163, 184, 0.08); overflow: hidden; }
    .bar-ghost { position: absolute; inset: 0 auto 0 0; height: 100%; border-radius: 5px; background: color-mix(in srgb, var(--ac) 22%, transparent); }
    .bar-fill { position: absolute; inset: 0 auto 0 0; height: 100%; border-radius: 5px; background: var(--ac); transition: width 0.3s ease; }

    .attr-nums { display: flex; align-items: baseline; gap: 3px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    .attr-cur { font-size: 19px; font-weight: 800; color: #e8eefb; }
    .attr-slash { font-size: 12px; color: #2c3a52; }
    .attr-pot { font-size: 12px; font-weight: 700; color: #56688a; }

    .attr-w { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 46px; }
    .attr-w-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: #56688a; }
    .attr-w-l { font-size: 7.5px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #334155; }
    .attr-w-key .attr-w-n { color: #a78bfa; }

    .attr-chev { display: grid; place-items: center; color: #3f5069; transition: transform 0.18s ease; }
    .attr-chev svg { width: 14px; height: 14px; }
    .attr-open .attr-chev { transform: rotate(180deg); color: var(--ac); }

    /* ---------------- drills ---------------- */
    .drills { padding: 4px 14px 16px; border-top: 1px solid rgba(51, 65, 85, 0.2); }
    .drills-note {
        font-size: 11px; line-height: 1.6; color: #64748b;
        padding: 10px 12px; margin: 12px 0 0;
        border-radius: 10px; background: rgba(34, 197, 94, 0.06);
        border: 1px solid rgba(34, 197, 94, 0.16);
    }
    .drill-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(232px, 1fr)); gap: 10px; margin-top: 12px; }
    .drill {
        display: flex; flex-direction: column;
        padding: 14px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.24);
        border-top: 2px solid var(--dc);
    }
    .drill-off { opacity: 0.62; }
    .drill-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
    .drill-tier { font-size: 8.5px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: var(--dc); }
    .pips { display: inline-flex; gap: 4px; }
    .pip { width: 6px; height: 6px; border-radius: 50%; background: rgba(100, 116, 139, 0.26); }
    .pip.on { background: var(--dc); }
    .drill-name { font-size: 13px; font-weight: 800; color: #e2e8f0; margin-bottom: 5px; }
    .drill-desc { font-size: 10.5px; line-height: 1.55; color: #4a5b76; margin-bottom: 11px; }

    .drill-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
    .ds { background: rgba(12, 16, 28, 0.5); border-radius: 8px; padding: 6px 8px; }
    .ds dt { font-size: 7.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #334155; margin-bottom: 2px; }
    .ds dd { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 700; color: #cbd5e1; }
    .ds-bad { color: #f87171 !important; }

    .gain {
        display: flex; flex-direction: column; gap: 2px;
        padding: 8px 10px; border-radius: 9px; margin-bottom: 11px;
        background: rgba(34, 197, 94, 0.07); border: 1px solid rgba(34, 197, 94, 0.16);
    }
    .gain-capped { background: rgba(148, 163, 184, 0.06); border-color: rgba(148, 163, 184, 0.14); }
    .gain-l { font-size: 7.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #334155; }
    .gain-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; font-weight: 800; color: #4ade80; }
    .gain-capped .gain-v { color: #64748b; font-size: 12px; }
    .gain-sub { font-size: 9px; color: #475569; }

    .drill-go {
        margin-top: auto; width: 100%; padding: 9px; border-radius: 10px; cursor: pointer;
        font-family: inherit; font-size: 11px; font-weight: 900;
        letter-spacing: 1px; text-transform: uppercase;
        color: #f5f3ff; border: 1px solid rgba(139, 92, 246, 0.4);
        background: linear-gradient(135deg, rgba(124, 58, 237, 0.85), rgba(139, 92, 246, 0.7));
        transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .drill-go:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(139, 92, 246, 0.28); }
    .drill-go:disabled { background: rgba(30, 41, 59, 0.6); border-color: rgba(51, 65, 85, 0.3); color: #475569; cursor: not-allowed; }
    .drill-block { font-size: 10px; line-height: 1.5; color: #64748b; margin-top: 8px; }

    /* ---------------- result panel ---------------- */
    .res-over { position: fixed; inset: 0; z-index: 130; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .res-bg { position: absolute; inset: 0; background: rgba(3, 6, 15, 0.82); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); }
    .res {
        position: relative; width: 100%; max-width: 440px; max-height: 92vh; overflow-y: auto;
        padding: 22px; border-radius: 20px;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid color-mix(in srgb, var(--rc) 30%, transparent);
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        animation: resIn 170ms ease-out;
    }
    @keyframes resIn { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .res { animation: none; } .attr-flash { animation: none; } }

    .res-head { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
    .res-head-fail { gap: 0; }
    .ring {
        position: relative; flex-shrink: 0; width: 78px; height: 78px; border-radius: 50%;
        background: conic-gradient(var(--rc) calc(var(--p) * 1%), rgba(148, 163, 184, 0.12) 0);
        display: grid; place-items: center;
    }
    .ring::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: #0b1020; }
    .ring-in { position: relative; display: flex; align-items: baseline; gap: 1px; }
    .ring-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 24px; font-weight: 800; color: var(--rc); }
    .ring-u { font-size: 11px; font-weight: 700; color: #475569; }
    .res-id { min-width: 0; }
    .res-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; font-weight: 800; color: #e8eefb; line-height: 1.25; }
    .res-attr { font-size: 11px; font-weight: 700; color: var(--rc); margin-top: 3px; }

    .res-detail { font-size: 11.5px; line-height: 1.65; color: #94a3b8; margin-bottom: 12px; }
    .res-coach {
        font-size: 12px; line-height: 1.6; color: #cbd5e1; font-style: italic;
        padding: 11px 13px; border-radius: 11px; margin-bottom: 14px;
        background: rgba(148, 163, 184, 0.05); border-left: 2px solid var(--rc);
    }
    .res-coach-l {
        display: block; font-style: normal; font-size: 8px; font-weight: 900;
        letter-spacing: 1.3px; text-transform: uppercase; color: #3f5069; margin-bottom: 5px;
    }

    .res-rows { display: flex; flex-direction: column; gap: 1px; margin-bottom: 12px; }
    .res-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 8px; }
    .res-row:nth-child(odd) { background: rgba(148, 163, 184, 0.035); }
    .rr-l { font-size: 10px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #3f5069; }
    .rr-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; text-align: right; }
    .rr-up { color: #a78bfa; }
    .rr-flat { color: #64748b; }

    .res-injury, .res-up { font-size: 11px; line-height: 1.6; padding: 10px 12px; border-radius: 11px; margin-bottom: 14px; color: #94a3b8; }
    .res-injury { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.22); }
    .res-injury strong { color: #f87171; }
    .res-up { background: rgba(139, 92, 246, 0.09); border: 1px solid rgba(139, 92, 246, 0.24); }
    .res-up strong { color: #c4b5fd; }
    .res-fine { font-size: 10.5px; color: #475569; margin-bottom: 14px; }

    .res-done {
        width: 100%; padding: 11px; border-radius: 12px; cursor: pointer;
        font-family: inherit; font-size: 12px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;
        color: #0b1020; background: var(--rc); border: none;
    }
    .res-done:hover { filter: brightness(1.08); }

    /* ---------------- responsive ---------------- */
    @media (max-width: 980px) {
        .eff { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
        .fac-row { grid-template-columns: minmax(70px, 1fr) 52px; row-gap: 2px; }
        .fac-note, .fac-bar { display: none; }
        .attr-head { grid-template-columns: 40px minmax(0, 1fr) auto 18px; gap: 10px; padding: 11px 12px; }
        .attr-w { display: none; }
        .attr-desc { display: none; }
        .eff-big { font-size: 38px; }
        .drill-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 420px) {
        .tr-role { display: none; }
        .attr-cur { font-size: 17px; }
        .sess { width: 152px; }
        .res { padding: 18px; }
        .ring { width: 64px; height: 64px; }
        .ring-n { font-size: 20px; }
    }
</style>
