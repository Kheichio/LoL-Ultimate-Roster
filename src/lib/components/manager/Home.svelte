<script>
    // The club home: the only place a match is played or the calendar moves on.
    // Everything that needs the manager is pulled up here first -- inbox
    // decisions answered in place, contracts decided in place -- so nothing is
    // played past an unread message or a player about to walk out.
    import { createEventDispatcher } from 'svelte';
    import { manager, mgrScreen, mgrMatch, mgrModal, playStep, mutate } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import {
        myTeam, currentStep, userFixture, blockInfo, nextOpponent, scoutReport, winChance, leagueName, tableRows, leagueOf,
        undecidedContracts, answerEvent, leagueKey, fearlessOn, hasBoard,
    } from '../../manager/engine.js';
    import { TACTIC_BY_ID, TACTIC_BEATS, ROLE_IDS, CALENDAR, SEASON_PHASES, phaseOfStep } from '../../manager/data.js';
    import { lineupOf, teamStrength } from '../../manager/match.js';
    import { ovrOf, ageOf } from '../../manager/people.js';
    import { renewalDemand, letContractRun, renewContract, renewAllExpiring, renewalBlock } from '../../manager/market.js';
    import { ovrColor, fmtMoney, moraleWord, ordinal, pct, champName, compLook, stageOf, msgKind, contractWord } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    export let busy = false;
    const dispatch = createEventDispatcher();

    $: s = $manager;
    $: team = myTeam(s);
    $: step = currentStep(s);
    $: stage = stageOf(s);
    $: fixture = userFixture(s);
    $: look = compLook(fixture ? fixture.kind : 'league');
    $: opp = nextOpponent(s);
    $: block = blockInfo(s);
    $: scout = opp ? scoutReport(s, opp.id) : null;
    $: odds = fixture && !block ? winChance(s) : null;
    $: myStr = team ? teamStrength(team, s.players) : 0;
    $: myTac = team ? TACTIC_BY_ID[team.tactic] : null;
    $: theirTac = scout ? TACTIC_BY_ID[scout.tactic] : null;
    $: counters = theirTac ? Object.entries(TACTIC_BEATS).filter(([, beats]) => beats.includes(theirTac.id)).map(([id]) => TACTIC_BY_ID[id]) : [];
    $: L = team ? leagueOf(s, team.id) : null;
    $: split = step.split || 'spring';
    $: rows = L ? tableRows(L, split, s) : [];
    $: myRank = rows.findIndex(r => r.id === (team && team.id)) + 1;
    $: last = s.last;
    $: lastOpp = last ? s.teams[last.tie.a === s.manager.teamId ? last.tie.b : last.tie.a] : null;
    $: lastWon = last ? last.tie.winner === s.manager.teamId : false;
    $: myScore = last ? (last.tie.a === s.manager.teamId ? last.tie.score : [last.tie.score[1], last.tie.score[0]]) : null;
    $: pending = s.inbox.filter(m => m.options && !m.answered);
    $: unreadList = s.inbox.filter(m => !m.read && !(m.options && !m.answered));
    $: inboxTop = s.inbox.slice(0, 6);
    $: newsTop = s.news.slice(0, 8);
    $: roster = team ? team.roster.map(id => s.players[id]).filter(Boolean) : [];
    $: lu = team ? lineupOf(team, s.players) : {};
    $: expiring = team ? roster.filter(p => p.until <= s.time.year) : [];
    $: undecided = team ? undecidedContracts(s) : [];
    $: alerts = buildAlerts(s, team, roster);
    $: phaseIdx = SEASON_PHASES.findIndex(p => p.id === phaseOfStep(step));
    $: road = goldenRoad(s, team);

    function buildAlerts(s, team, roster) {
        const out = [];
        if (!team) return out;
        const sad = roster.filter(p => (p.mor || 0) < 40);
        if (sad.length) out.push({ tone: 'bad', icon: 'heart', text: `${sad.map(p => p.name).join(', ')} ${sad.length === 1 ? 'is' : 'are'} unhappy`, go: 'squad' });
        if ((s.offers || []).length) out.push({ tone: 'good', icon: 'coins', text: `${s.offers.length} offer${s.offers.length === 1 ? '' : 's'} for your players: answer before the window closes`, go: 'transfers' });
        if (s.manager.points) out.push({ tone: 'good', icon: 'star', text: `${s.manager.points} perk point${s.manager.points === 1 ? '' : 's'} to spend`, go: 'club' });
        if (roster.length < 6) out.push({ tone: 'warn', icon: 'squad', text: `Only ${roster.length} players: sign depth before someone is needed`, go: 'transfers' });
        const retiring = roster.filter(p => p.retiring === s.time.year);
        if (retiring.length) out.push({ tone: 'warn', icon: 'clock', text: `${retiring.map(p => p.name).join(', ')} will retire at the end of the season`, go: 'squad' });
        if (s.finance.balance < 0) out.push({ tone: 'bad', icon: 'coins', text: hasBoard(s) ? 'Your balance is negative. The board will not like it.' : 'Your club is in debt: no new wages until the balance is positive.', go: 'club' });
        return out;
    }

    /** Spring, MSI, Summer, Worlds: won, still possible, or gone, this year. */
    function goldenRoad(s, team) {
        if (!team || team.tier !== 1 || !s.season) return null;
        const S = s.season, me = team.id, y = s.time.year;
        const won = (kind, sp) => s.manager.trophies.some(t => t.year === y && t.teamId === me && t.kind === kind && (!sp || t.split === sp));
        const league = (sp) => {
            if (won('league', sp)) return 'won';
            const b = S.playoffs[leagueKey(team.region, team.tier) + ':' + sp];
            if (b && (!b.teams.includes(me) || b.champion || b.places[me])) return 'out';
            return 'open';
        };
        // An international not drawn yet is still open; once drawn, you are in it or not.
        const intl = (b, kind) => {
            if (won(kind)) return 'won';
            if (b) return b.teams.includes(me) && !b.places[me] ? 'open' : 'out';
            return 'open';
        };
        const items = [
            { id: 'spring', name: 'Spring', st: league('spring') },
            { id: 'msi', name: 'MSI', st: intl(S.msi, 'msi') },
            { id: 'summer', name: 'Summer', st: league('summer') },
            { id: 'worlds', name: 'Worlds', st: intl(S.worlds, 'worlds') },
        ];
        const alive = items.every(i => i.st !== 'out');
        return { items, alive, done: items.every(i => i.st === 'won') };
    }

    function play() { mgrMatch.set({ open: true }); }
    function sim() { if (!busy && !block) playStep(null); }
    function answer(m, opt) {
        const r = mutate(s => answerEvent(s, m.id, opt));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 3500);
    }
    function letGo(p) {
        const r = mutate(s => letContractRun(s, p.id, true));
        if (r) showToast(r.msg, r.ok ? 'info' : 'error', 3500);
    }
    function keep(p) { mutate(s => letContractRun(s, p.id, false)); }
    function renew(p) {
        const r = mutate(s => renewContract(s, p.id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
    }
    function renewAll() {
        const r = mutate(s => renewAllExpiring(s));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 6000);
    }
    const toneColor = { good: '#34d399', bad: '#f87171', warn: '#fbbf24' };
    const ROAD_ICON = { won: 'check', out: 'close', open: 'clock' };
</script>

<div class="home">
    <!-- ══════ NEXT UP ══════ -->
    <section class="next panel" style="--c:{fixture ? look.color : stage.color}; --t:{team ? team.color : '#64748b'}">
        {#if s.jobless}
            <div class="nx-empty">
                <Icon name="briefcase" size={30} />
                <div>
                    <h2>You are between jobs</h2>
                    <p class="dim">Pick one of your job offers on the Club screen to carry on.</p>
                </div>
                <button class="btn btn-p big" on:click={() => mgrScreen.set('club')}>See job offers</button>
            </div>
        {:else if fixture && opp}
            <div class="nx-comp">
                <span class="nc-ico"><Icon name={look.icon} size={22} stroke={2.2} /></span>
                <div class="nc-t">
                    <span class="nc-eyebrow">Next match</span>
                    <span class="nc-name">{fixture.comp}</span>
                </div>
                <div class="nc-chips">
                    <span class="chip" style="--c:{look.color}">Best of {fixture.tie.bo}</span>
                    {#if fixture.bigStage}<span class="chip" style="--c:#fbbf24">Big stage</span>{/if}
                    {#if fixture.final}<span class="chip" style="--c:#f472b6">Final</span>{/if}
                    {#if fearlessOn(s)}<span class="chip" style="--c:#f97316">Fearless draft</span>{/if}
                </div>
            </div>
            <div class="vs">
                <div class="side">
                    <TeamBadge {team} size={64} />
                    <span class="s-name">{team.name}</span>
                    <span class="ovr" style="--c:{ovrColor(myStr)}">{Math.round(myStr)}</span>
                </div>
                <div class="mid">
                    {#if odds}
                        <span class="odds-n" style="color:{odds.series >= 0.5 ? '#34d399' : '#fbbf24'}">{pct(odds.series)}%</span>
                        <span class="odds-l">to win the series</span>
                        <span class="odds-g">{pct(odds.game)}% per game</span>
                    {:else}
                        <span class="odds-l big-vs">VS</span>
                    {/if}
                </div>
                <div class="side">
                    <TeamBadge team={opp} size={64} />
                    <span class="s-name">{opp.name}</span>
                    <span class="ovr" style="--c:{ovrColor(scout.strength)}">{Math.round(scout.strength)}</span>
                </div>
            </div>
            <div class="intel">
                <div class="int"><span class="int-l">Your plan</span><span class="int-v" style="color:{myTac.color}">{myTac.name}</span></div>
                <div class="int"><span class="int-l">They usually play</span><span class="int-v" style="color:{theirTac.color}">{theirTac.name}</span></div>
                <div class="int"><span class="int-l">Counter it with</span><span class="int-v">{counters.map(c => c.short).join(' or ')}</span></div>
                <div class="int"><span class="int-l">Their star</span><span class="int-v">{#if scout.star}<PName p={scout.star} /> <span class="muted">{scout.star.role}</span>{/if}</span></div>
            </div>
            {#if block}<p class="blk"><Icon name="alert" size={15} /> {block.msg} <button class="btn btn-sm" on:click={() => mgrScreen.set(block.go)}>Fix it</button></p>{/if}
            <div class="nx-btns">
                <button class="btn btn-p big" on:click={play} disabled={!!block}><Icon name="play" size={16} stroke={2.4} /> Play the series</button>
                <button class="btn big" on:click={sim} disabled={!!block || busy}><Icon name="bolt" size={15} /> Sim it</button>
                <button class="btn big" on:click={() => mgrScreen.set('tactics')}><Icon name="target" size={15} /> Tactics</button>
            </div>
        {:else}
            <div class="nx-empty">
                <span class="nc-ico"><Icon name={stage.icon} size={24} stroke={2.2} /></span>
                <div>
                    <span class="nc-eyebrow">{s.time.year}</span>
                    <h2>{step.name}</h2>
                    <p class="dim">
                        {#if step.kind === 'window'}The transfer window is open. Sign and sell on the Transfers screen, set your lineup, then start the split. You need a full five to close the window.
                        {:else if step.kind === 'offseason'}The year is over. Decide every expiring contract, then the awards, retirements, rookies and the board's verdict.
                        {:else if step.kind === 'league'}Bye week: no match for you. Training still runs.
                        {:else}You are not in this one. The rest of the world plays on.{/if}
                    </p>
                    {#if block}<p class="blk"><Icon name="alert" size={15} /> {block.msg} <button class="btn btn-sm" on:click={() => mgrScreen.set(block.go)}>Fix it</button></p>{/if}
                </div>
                <button class="btn btn-p big" on:click={() => dispatch('next')} disabled={busy || !!block}>{busy ? 'Simulating…' : 'Continue'} <Icon name="arrow" size={15} stroke={2.4} /></button>
            </div>
        {/if}
    </section>

    <!-- ══════ THE YEAR ══════ -->
    <section class="year">
        {#each SEASON_PHASES as p, i}
            <span class="yp" class:done={i < phaseIdx} class:now={i === phaseIdx} style="--pc:{p.color}" title={p.name}>
                <span class="yp-dot"><Icon name={p.icon} size={13} stroke={2.2} /></span>
                <span class="yp-n">{p.short}</span>
            </span>
        {/each}
    </section>

    <!-- ══════ NEEDS YOU ══════ -->
    {#if pending.length || undecided.length || expiring.length}
        <section class="needs">
            {#each pending as m (m.id)}
                <div class="decide">
                    <div class="d-h"><span class="d-tag">Decision needed</span><b>{m.title}</b></div>
                    <p class="d-b">{m.body}</p>
                    <div class="d-o">
                        {#each m.options as o}
                            <button class="opt" on:click={() => answer(m, o.id)}><b>{o.label}</b>{#if o.hint}<span>{o.hint}</span>{/if}</button>
                        {/each}
                    </div>
                </div>
            {/each}
            {#if expiring.length}
                <div class="contracts" class:urgent={step.kind === 'offseason' && undecided.length}>
                    <div class="c-h"><Icon name="quests" size={16} /> <b>Contracts ending after {s.time.year}</b>
                        <span class="muted small">{undecided.length ? `${undecided.length} undecided · decide before the offseason or it will not start` : 'All decided'}</span>
                        {#if undecided.length > 1}<button class="btn btn-sm btn-p renew-all" on:click={renewAll}><Icon name="check" size={12} stroke={2.6} /> Renew all at their asks</button>{/if}</div>
                    <div class="c-list">
                        {#each expiring as p (p.id)}
                            {@const cw = contractWord(p, s.time.year)}
                            <div class="c-row">
                                <span class="rl">{p.role}</span>
                                <PName {p} />
                                <span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span>
                                <span class="muted small">age {ageOf(p, s.time.year)}</span>
                                {#if p.retiring === s.time.year}
                                    <span class="chip" style="--c:#f87171">Retiring</span>
                                {:else if p.leaving === s.time.year}
                                    <span class="chip" style="--c:#f87171">Leaving</span>
                                    <button class="btn btn-sm" on:click={() => keep(p)}>Undo</button>
                                {:else}
                                    {@const blk = renewalBlock(s, p)}
                                    <span class="c-ask small">asks ~{fmtMoney(renewalDemand(s, p, 2, p.status || 'regular'))}/yr for 2 years</span>
                                    {#if blk}<span class="chip" style="--c:#f87171" title={blk}>Won't talk</span>{:else}<button class="btn btn-sm btn-p" on:click={() => renew(p)}><Icon name="check" size={12} stroke={2.6} /> Renew</button>{/if}
                                    <button class="btn btn-sm" on:click={() => mgrModal.set({ kind: 'player', id: p.id })}>Negotiate</button>
                                    <button class="btn btn-sm btn-danger" on:click={() => letGo(p)}>Let go</button>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </section>
    {/if}

    {#if alerts.length}
        <section class="alerts">
            {#each alerts as a}
                <button class="alert" style="--c:{toneColor[a.tone]}" on:click={() => mgrScreen.set(a.go)}>
                    <Icon name={a.icon} size={15} /> <span>{a.text}</span> <Icon name="chevron" size={13} stroke={2.4} />
                </button>
            {/each}
        </section>
    {/if}

    <div class="cols">
        <div class="col">
            <!-- ══════ TABLE ══════ -->
            {#if L && team}
                <section class="panel">
                    <div class="ph">
                        <h3><Icon name="ranking" size={15} /> {leagueName(team.region, team.tier)} · {split === 'spring' ? 'Spring' : 'Summer'}</h3>
                        {#if myRank}<span class="chip" style="--c:#34d399">You: {ordinal(myRank)}</span>{/if}
                    </div>
                    <div class="tbl-wrap">
                        <table class="tbl">
                            <thead><tr><th>#</th><th>Team</th><th class="c">W</th><th class="c">L</th><th class="c">+/-</th><th class="r">OVR</th></tr></thead>
                            <tbody>
                                {#each rows as r, i (r.id)}
                                    {@const t = s.teams[r.id]}
                                    <tr class:me={r.id === team.id} class="click" class:cut={i === 3} on:click={() => mgrModal.set({ kind: 'team', id: r.id })}>
                                        <td class="num muted">{i + 1}</td>
                                        <td><span class="trow"><TeamBadge team={t} size={22} /> {t.name}</span></td>
                                        <td class="c num">{r.w}</td>
                                        <td class="c num">{r.l}</td>
                                        <td class="c num" class:good={r.gw - r.gl > 0} class:bad={r.gw - r.gl < 0}>{r.gw - r.gl > 0 ? '+' : ''}{r.gw - r.gl}</td>
                                        <td class="r"><span class="ovr" style="--c:{ovrColor(teamStrength(t, s.players))}">{Math.round(teamStrength(t, s.players))}</span></td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <p class="legend muted">Top four reach the playoffs.{#if team.tier === 1} Last over both splits is relegated; ninth plays a promotion series.{:else} The summer champion is promoted; the runner-up plays a promotion series.{/if}</p>
                </section>
            {/if}

            <!-- ══════ LAST RESULT ══════ -->
            {#if last && lastOpp}
                <section class="panel">
                    <div class="ph"><h3><Icon name="swords" size={15} /> Last result</h3><span class="muted small">{last.comp}</span></div>
                    <div class="last">
                        <span class="res" class:won={lastWon}>{lastWon ? 'WIN' : 'LOSS'}</span>
                        <span class="score num">{myScore[0]}–{myScore[1]}</span>
                        <span class="lo">vs <TeamBadge team={lastOpp} size={22} /> {lastOpp.name}</span>
                    </div>
                    {#if last.draft && last.draft.length}
                        <div class="lgames">
                            {#each last.draft as g, i}
                                <div class="lg" class:w={g.w === 'a'}><b>G{i + 1}</b> <span>{g.mine ? ROLE_IDS.map(r => champName(g.mine[r])).join(' · ') : ''}</span></div>
                            {/each}
                        </div>
                    {/if}
                </section>
            {/if}

            <!-- ══════ SQUAD SNAPSHOT ══════ -->
            {#if team}
                <section class="panel">
                    <div class="ph"><h3><Icon name="squad" size={15} /> Starting five</h3><button class="btn btn-sm" on:click={() => mgrScreen.set('squad')}>Squad <Icon name="chevron" size={12} stroke={2.4} /></button></div>
                    <div class="five">
                        {#each ROLE_IDS as role}
                            {@const p = lu[role]}
                            <div class="f-row">
                                <span class="f-role">{role}</span>
                                <span class="f-name"><PName {p} />{#if p && p.recent && p.recent.length}<span class="f-rec" title="Last played">{p.recent.slice(0, 3).map(champName).join(', ')}</span>{/if}</span>
                                {#if p}
                                    <span class="f-mor" style="color:{moraleWord(p.mor).color}" title="Morale {Math.round(p.mor)}">{moraleWord(p.mor).word}</span>
                                    <span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span>
                                {:else}<span class="bad small">Empty seat</span>{/if}
                            </div>
                        {/each}
                    </div>
                    <div class="chem">
                        <span class="muted small">Chemistry</span>
                        <span class="bar" style="flex:1"><i style="width:{team.chem}%; --c:{team.chem >= 70 ? '#34d399' : team.chem >= 45 ? '#fbbf24' : '#f87171'}"></i></span>
                        <span class="num small">{Math.round(team.chem)}</span>
                    </div>
                </section>
            {/if}
        </div>

        <div class="col">
            <!-- ══════ INBOX ══════ -->
            <section class="panel inbox-p" class:hot={pending.length > 0} class:has={unreadList.length > 0}>
                <div class="ph">
                    <h3><Icon name="chat" size={15} /> Inbox {#if unreadList.length + pending.length}<span class="ib-n">{unreadList.length + pending.length} new</span>{/if}</h3>
                    <button class="btn btn-sm" on:click={() => mgrScreen.set('inbox')}>Open <Icon name="chevron" size={12} stroke={2.4} /></button>
                </div>
                {#if inboxTop.length}
                    <ul class="msgs">
                        {#each inboxTop as m (m.id)}
                            {@const k = msgKind(m.kind)}
                            <li class:unread={!m.read} style="--k:{k.color}">
                                <button on:click={() => mgrScreen.set('inbox')}>
                                    <span class="m-ico"><Icon name={k.icon} size={14} /></span>
                                    <span class="m-t">{m.title}</span>
                                    {#if m.options && !m.answered}<span class="chip" style="--c:#f472b6">Decide</span>{:else if !m.read}<span class="m-dot"></span>{/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                {:else}<div class="empty">Nothing yet.</div>{/if}
            </section>

            <!-- ══════ GOLDEN ROAD ══════ -->
            {#if road}
                <section class="panel road" class:alive={road.alive}>
                    <div class="ph"><h3><Icon name="crown" size={15} /> Golden Road {s.time.year}</h3><span class="muted small">{road.done ? 'Completed!' : road.alive ? 'Still on' : 'Gone this year'}</span></div>
                    <div class="rd">
                        {#each road.items as it}
                            <span class="rd-i rd-{it.st}"><Icon name={ROAD_ICON[it.st]} size={13} stroke={2.6} /> {it.name}</span>
                        {/each}
                    </div>
                    <p class="muted small">Win Spring, MSI, Summer and Worlds in one year.</p>
                </section>
            {/if}

            <!-- ══════ BOARD ══════ -->
            <section class="panel">
                {#if hasBoard(s)}
                    <div class="ph"><h3><Icon name="briefcase" size={15} /> The board</h3><span class="chip" style="--c:{s.board.confidence >= 60 ? '#34d399' : s.board.confidence >= 35 ? '#fbbf24' : '#f87171'}">{Math.round(s.board.confidence)}% confidence</span></div>
                    <ul class="objs">
                        {#each s.board.objectives as o}
                            <li><span class="o-dot" class:met={o.met === true} class:miss={o.met === false}></span>{o.text}</li>
                        {/each}
                    </ul>
                {:else}
                    <div class="ph"><h3><Icon name="crown" size={15} /> Your club</h3><span class="chip" style="--c:#fbbf24">Owner · 100%</span></div>
                    <p class="own small">You own all of {team ? team.name : 'the club'}: no board, no objectives, no wage limit. Only the balance can stop you signing. Selling a stake is on the Club screen.</p>
                {/if}
                <div class="money">
                    <span class="muted small">Balance</span><b class="num" class:bad={s.finance.balance < 0}>{fmtMoney(s.finance.balance)}</b>
                </div>
            </section>

            <!-- ══════ NEWS ══════ -->
            <section class="panel">
                <div class="ph"><h3><Icon name="globe" size={15} /> Around the world</h3></div>
                {#if newsTop.length}
                    <ul class="news">
                        {#each newsTop as n, i (i + n.text)}
                            <li class="n-{n.kind}"><span class="n-when muted">{n.y}</span>{n.text}</li>
                        {/each}
                    </ul>
                {:else}<div class="empty">The season has not started.</div>{/if}
            </section>
        </div>
    </div>
</div>

<style>
    .home { display: flex; flex-direction: column; gap: 14px; }
    .next { position: relative; overflow: hidden; background: radial-gradient(80% 140% at 0% 0%, color-mix(in srgb, var(--c) 20%, transparent), transparent 60%), radial-gradient(60% 120% at 100% 100%, color-mix(in srgb, var(--t) 14%, transparent), transparent 60%), rgba(15, 23, 42, 0.72); padding: 20px 22px; border-color: color-mix(in srgb, var(--c) 45%, var(--line)); border-top: 4px solid var(--c); }
    .nx-comp { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .nc-ico { width: 46px; height: 46px; flex-shrink: 0; display: grid; place-items: center; border-radius: 13px; color: #0b1120; background: var(--c); box-shadow: 0 0 22px color-mix(in srgb, var(--c) 50%, transparent); }
    .nc-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .nc-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--c); }
    .nc-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; font-weight: 700; color: #fff; }
    .nc-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; }
    .side { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
    .s-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 20px; font-weight: 700; color: #fff; }
    .mid { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 140px; }
    .odds-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 42px; font-weight: 700; line-height: 1; }
    .odds-l { font-size: 11.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #a5b4cf; }
    .big-vs { font-size: 28px; }
    .odds-g { font-size: 12px; color: #8193ad; }
    .intel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 16px 0 14px; }
    .int { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 11px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(71, 85, 105, 0.4); min-width: 0; }
    .int-l { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #8aa0c4; }
    .int-v { font-size: 14px; font-weight: 800; color: #f1f5f9; display: flex; align-items: center; gap: 6px; min-width: 0; }
    .blk { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #fbbf24; font-size: 13.5px; font-weight: 700; margin: 0 0 10px; }
    .nx-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .big { padding: 12px 18px; font-size: 14.5px; }
    .nx-empty { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .nx-empty > :global(.ico) { color: #34d399; }
    .nx-empty div { flex: 1; min-width: 220px; }
    .nx-empty h2 { margin: 2px 0 4px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; color: #fff; }
    .nx-empty p { margin: 0 0 6px; font-size: 14px; line-height: 1.55; }

    .year { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; }
    .yp { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 4px; border-radius: 11px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.4); color: #64748b; }
    .yp-dot { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; background: rgba(51, 65, 85, 0.4); }
    .yp-n { font-size: 10.5px; font-weight: 800; letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap; }
    .yp.done { color: #a5b4cf; }
    .yp.done .yp-dot { background: color-mix(in srgb, var(--pc) 30%, #1e293b); color: #e2e8f0; }
    .yp.now { color: #fff; border-color: var(--pc); background: color-mix(in srgb, var(--pc) 14%, rgba(15, 23, 42, 0.7)); box-shadow: 0 0 18px color-mix(in srgb, var(--pc) 22%, transparent); }
    .yp.now .yp-dot { background: var(--pc); color: #0b1120; }

    .needs { display: flex; flex-direction: column; gap: 10px; }
    .decide { padding: 14px 16px; border-radius: 15px; background: rgba(244, 114, 182, 0.08); border: 1px solid rgba(244, 114, 182, 0.55); box-shadow: 0 0 22px rgba(244, 114, 182, 0.1); }
    .d-h { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .d-h b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; color: #fff; }
    .d-tag { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #fff; background: #ec4899; }
    .d-b { margin: 8px 0 10px; font-size: 14px; line-height: 1.6; color: #e2e8f0; white-space: pre-line; }
    .d-o { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
    .opt { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 11px 13px; border-radius: 12px; cursor: pointer; font-family: inherit; text-align: left; color: #fff; background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(71, 85, 105, 0.55); }
    .opt:hover { border-color: #f472b6; background: rgba(244, 114, 182, 0.08); }
    .opt b { font-size: 14px; }
    .opt span { font-size: 12px; color: #a5b4cf; }
    .contracts { padding: 13px 15px; border-radius: 15px; background: rgba(251, 146, 60, 0.07); border: 1px solid rgba(251, 146, 60, 0.45); }
    .contracts.urgent { border-color: #fb923c; box-shadow: 0 0 22px rgba(251, 146, 60, 0.18); }
    .c-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #fdba74; margin-bottom: 8px; }
    .c-h b { color: #fff; font-size: 14.5px; }
    .c-list { display: flex; flex-direction: column; gap: 5px; }
    .c-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 7px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .rl { width: 32px; font-size: 10.5px; font-weight: 900; color: #8aa0c4; }
    .c-ask { margin-left: auto; color: #fde68a; font-weight: 700; }
    .renew-all { margin-left: auto; }
    .small { font-size: 12.5px; }

    .alerts { display: flex; flex-wrap: wrap; gap: 8px; }
    .alert { display: inline-flex; align-items: center; gap: 8px; padding: 10px 13px; border-radius: 11px; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 10%, rgba(15, 23, 42, 0.75)); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
    .alert span { color: #f1f5f9; }

    .cols { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .trow { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: #f1f5f9; }
    tr.cut td { border-bottom: 1px dashed rgba(52, 211, 153, 0.55); }
    .legend { font-size: 12px; margin: 8px 0 0; }
    .last { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .res { font-size: 11.5px; font-weight: 900; letter-spacing: 1px; padding: 4px 9px; border-radius: 7px; color: #fecaca; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.45); }
    .res.won { color: #bbf7d0; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.45); }
    .score { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 28px; font-weight: 700; color: #fff; }
    .lo { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: #dbe4f0; }
    .lgames { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
    .lg { display: flex; gap: 8px; padding: 5px 9px; border-radius: 8px; font-size: 12px; background: rgba(2, 6, 23, 0.4); border-left: 3px solid #f87171; color: #a5b4cf; }
    .lg.w { border-left-color: #34d399; }
    .lg b { color: #fff; }
    .lg span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .five { display: flex; flex-direction: column; gap: 5px; }
    .f-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .f-role { width: 32px; font-size: 10.5px; font-weight: 900; color: #8aa0c4; }
    .f-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .f-rec { font-size: 11px; color: #7dd3fc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .f-mor { font-size: 12px; font-weight: 800; }
    .chem { display: flex; align-items: center; gap: 10px; margin-top: 10px; }

    .inbox-p.has { border-color: rgba(251, 191, 36, 0.5); }
    .inbox-p.hot { border-color: #f472b6; box-shadow: 0 0 20px rgba(244, 114, 182, 0.15); }
    .ib-n { font-size: 10.5px; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 999px; color: #0b1120; background: #fbbf24; }
    .hot .ib-n { color: #fff; background: #f472b6; }
    .msgs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .msgs button { width: 100%; display: flex; align-items: center; gap: 9px; padding: 9px 10px; border-radius: 10px; border: none; cursor: pointer; text-align: left; font-family: inherit; font-size: 13.5px; color: #a5b4cf; background: rgba(2, 6, 23, 0.4); }
    .msgs li.unread button { color: #fff; font-weight: 700; background: color-mix(in srgb, var(--k) 10%, rgba(2, 6, 23, 0.5)); }
    .m-ico { width: 26px; height: 26px; flex-shrink: 0; display: grid; place-items: center; border-radius: 8px; color: var(--k); background: color-mix(in srgb, var(--k) 15%, transparent); }
    .m-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .m-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--k); flex-shrink: 0; }
    .road.alive { border-color: rgba(250, 204, 21, 0.45); }
    .rd { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 6px; }
    .rd-i { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 8px 4px; border-radius: 10px; font-size: 12.5px; font-weight: 800; color: #a5b4cf; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(71, 85, 105, 0.45); }
    .rd-won { color: #1c1400; background: #facc15; border-color: #facc15; }
    .rd-out { color: #64748b; text-decoration: line-through; opacity: 0.7; }
    .objs { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
    .own { margin: 0 0 12px; line-height: 1.55; color: #dbe4f0; }
    .objs li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #f1f5f9; }
    .o-dot { width: 9px; height: 9px; border-radius: 50%; background: #64748b; flex-shrink: 0; }
    .o-dot.met { background: #34d399; }
    .o-dot.miss { background: #f87171; }
    .money { display: flex; align-items: baseline; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--line); }
    .money b { font-size: 17px; color: #f1f5f9; }
    .news { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 13px; line-height: 1.5; color: #dbe4f0; }
    .n-when { font-size: 11px; margin-right: 7px; }
    .news .n-title { color: #fcd34d; }
    .news .n-award { color: #c4b5fd; }
    .news .n-transfer { color: #93c5fd; }

    @media (max-width: 1000px) {
        .cols { grid-template-columns: 1fr; }
        .intel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .year { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
        .nc-chips { width: 100%; }
        .nc-name { font-size: 19px; }
        .vs { grid-template-columns: 1fr; }
        .s-name { font-size: 16px; }
        .yp-n { font-size: 9px; }
    }
</style>
