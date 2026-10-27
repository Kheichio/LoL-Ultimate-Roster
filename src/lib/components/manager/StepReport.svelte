<script>
    // What just happened: your result and the champions you played, the rest of
    // your competition this week, who levelled up, and what landed in the inbox.
    // It only ever goes BACK to the club home: the next match is played from
    // there, never chained from here.
    import { manager, mgrScreen, closeReport } from '../../stores/manager.js';
    import { myTeam, leagueKey, leagueName } from '../../manager/engine.js';
    import { CALENDAR, STEP_INDEX, ROLE_IDS } from '../../manager/data.js';
    import { champName, compLook, msgKind } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    export let summary;
    $: s = $manager;
    $: team = myTeam(s);
    $: played = CALENDAR[STEP_INDEX[summary.step]] || null;
    $: mine = summary.mine;
    $: me = s.manager.teamId;
    $: won = mine && mine.tie.winner === me;
    $: score = mine ? (mine.tie.a === me ? mine.tie.score : [mine.tie.score[1], mine.tie.score[0]]) : null;
    $: opp = mine ? s.teams[mine.tie.a === me ? mine.tie.b : mine.tie.a] : null;
    $: others = otherTies(s, played, team);
    $: look = compLook(mine ? mine.kind : played && played.kind === 'intl' ? played.event : played ? played.kind : 'league');
    $: fresh = (s.inbox || []).filter(m => !m.read && Number(String(m.id).slice(1)) > (summary.msgFrom || 0));
    $: decisions = (s.inbox || []).filter(m => m.options && !m.answered).length;

    function otherTies(s, st, team) {
        if (!st || !team) return null;
        const S = s.season;
        if (st.kind === 'league') {
            const L = S.leagues[leagueKey(team.region, team.tier)];
            return L ? { title: `${leagueName(team.region, team.tier)} · week ${st.md + 1}`, ties: (L[st.split].fixtures[st.md] || []) } : null;
        }
        if (st.kind === 'playoffs') {
            const b = S.playoffs[leagueKey(team.region, team.tier) + ':' + st.split];
            return b ? { title: b.name, ties: b.rounds[st.round] || [] } : null;
        }
        if (st.kind === 'intl') {
            const b = st.event === 'msi' ? S.msi : S.worlds;
            return b ? { title: st.name, ties: b.rounds[st.round] || [] } : null;
        }
        if (st.kind === 'promotion') {
            return { title: 'Promotion series', ties: Object.values(S.promo).map(p => p.tie).filter(Boolean) };
        }
        return null;
    }

    function close() { closeReport(summary); }
    function toInbox() { closeReport(summary); mgrScreen.set('inbox'); }
    function onKey(e) {
        if (e.key === 'Escape') close();
        const tag = e.target && e.target.tagName;
        if (e.key === 'Enter' && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(tag)) { e.preventDefault(); close(); }
    }
</script>

<svelte:window on:keydown={onKey} />

<div class="modal-back" on:click|self={close} role="presentation">
    <div class="modal sr" role="dialog" aria-modal="true" aria-label="Week report" style="--c:{look.color}">
        <button class="modal-x" on:click={close} aria-label="Close"><Icon name="close" size={16} /></button>
        <div class="sr-head">
            <span class="sr-ico"><Icon name={look.icon} size={20} stroke={2.2} /></span>
            <div>
                <p class="eyebrow">{summary.year} · result</p>
                <h2>{mine ? mine.comp : summary.name}</h2>
            </div>
        </div>

        {#if mine && opp}
            <div class="mine" class:won>
                <span class="res">{won ? 'WIN' : 'LOSS'}</span>
                <TeamBadge {team} size={40} />
                <span class="sc num">{score[0]}–{score[1]}</span>
                <TeamBadge team={opp} size={40} />
                <span class="vs">vs {opp.name}</span>
            </div>
            {#if mine.draft && mine.draft.length}
                <div class="games">
                    {#each mine.draft as g, i}
                        <div class="g" class:gw={g.w === 'a'}>
                            <span class="g-h">Game {i + 1} · <b>{g.w === 'a' ? 'W' : 'L'}</b>{#if g.blue}<i class="side" class:red={g.blue !== 'a'}>{g.blue === 'a' ? 'Blue' : 'Red'}</i>{/if}</span>
                            <span class="g-c">{#if g.mine}{ROLE_IDS.map(r => champName(g.mine[r])).join(' · ')}{/if}</span>
                        </div>
                    {/each}
                </div>
            {/if}
        {:else}
            <p class="none"><Icon name="clock" size={14} /> {played && played.kind === 'league' ? 'A bye week for you. Training ran as normal.' : 'You were not playing this week. The world played on.'}</p>
        {/if}

        {#if summary.notes && summary.notes.length}
            <ul class="notes">{#each summary.notes as n}<li><Icon name="flag" size={14} /> {n}</li>{/each}</ul>
        {/if}

        {#if fresh.length}
            <div class="inbox-box" class:hot={decisions > 0}>
                <div class="ib-h"><Icon name="chat" size={15} /> {fresh.length} new message{fresh.length === 1 ? '' : 's'}{#if decisions}{' · '}<b>{decisions} decision{decisions === 1 ? '' : 's'} waiting</b>{/if}</div>
                <ul>
                    {#each fresh.slice(0, 5) as m (m.id)}
                        {@const k = msgKind(m.kind)}
                        <li style="--k:{k.color}"><Icon name={k.icon} size={14} /> <span>{m.title}</span>{#if m.options && !m.answered}<span class="chip" style="--c:#f472b6">Decide</span>{/if}</li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if others && others.ties && others.ties.length}
            <div class="oth">
                <div class="oth-h">{others.title}</div>
                {#each others.ties as tie}
                    {#if tie.score}
                        <div class="tie" class:mine={tie.a === me || tie.b === me}>
                            <span class="t" class:w={tie.winner === tie.a}><TeamBadge team={s.teams[tie.a]} size={20} /> {s.teams[tie.a].name}</span>
                            <span class="num tsc">{tie.score.join('–')}</span>
                            <span class="t tr" class:w={tie.winner === tie.b}>{s.teams[tie.b].name} <TeamBadge team={s.teams[tie.b]} size={20} /></span>
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}

        {#if summary.levelUps && summary.levelUps.length}
            <div class="lvls">
                <Icon name="upgrade" size={15} />
                {#each summary.levelUps as l}<span class="chip" style="--c:#34d399">{l.name} → Lv {l.lv}</span>{/each}
            </div>
        {/if}

        <div class="btns">
            {#if fresh.length}<button class="btn" on:click={toInbox}><Icon name="chat" size={14} /> Read the inbox</button>{/if}
            <button class="btn btn-p" on:click={close}><Icon name="home" size={14} /> Back to Home</button>
        </div>
        <p class="muted hint">The next match is played from the club home.</p>
    </div>
</div>

<style>
    .sr { max-width: 680px; border-top: 4px solid var(--c); }
    .sr-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-right: 40px; }
    .sr-ico { width: 42px; height: 42px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; color: #0b1120; background: var(--c); box-shadow: 0 0 18px color-mix(in srgb, var(--c) 45%, transparent); }
    .eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--c); margin: 0 0 3px; }
    h2 { margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; color: #fff; }
    .mine { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 14px; margin-bottom: 10px; background: rgba(127, 29, 29, 0.18); border: 1px solid rgba(239, 68, 68, 0.4); flex-wrap: wrap; }
    .mine.won { background: rgba(16, 185, 129, 0.12); border-color: rgba(52, 211, 153, 0.45); }
    .res { font-size: 13px; font-weight: 900; letter-spacing: 1px; color: #fca5a5; }
    .won .res { color: #6ee7b7; }
    .sc { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 30px; font-weight: 700; color: #fff; }
    .vs { font-weight: 700; color: #dbe4f0; }
    .games { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .g { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); border-left: 3px solid #f87171; font-size: 12.5px; }
    .g.gw { border-left-color: #34d399; }
    .g-h { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; color: #a5b4cf; font-weight: 700; }
    .g-h b { color: #fff; }
    .side { font-style: normal; font-size: 9.5px; font-weight: 900; text-transform: uppercase; padding: 1px 6px; border-radius: 5px; color: #bfdbfe; background: rgba(59, 130, 246, 0.2); }
    .side.red { color: #fecaca; background: rgba(239, 68, 68, 0.2); }
    .g-c { color: #dbe4f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .none { display: flex; align-items: center; gap: 8px; color: #a5b4cf; margin: 0 0 12px; }
    .notes { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .notes li { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #fde68a; }
    .inbox-box { padding: 11px 13px; border-radius: 12px; margin-bottom: 12px; background: rgba(251, 191, 36, 0.07); border: 1px solid rgba(251, 191, 36, 0.4); }
    .inbox-box.hot { background: rgba(244, 114, 182, 0.08); border-color: rgba(244, 114, 182, 0.55); }
    .ib-h { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 800; color: #fde68a; margin-bottom: 6px; }
    .hot .ib-h { color: #fbcfe8; }
    .inbox-box ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .inbox-box li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #f1f5f9; }
    .inbox-box li :global(.ico) { color: var(--k); flex-shrink: 0; }
    .inbox-box li span:not(.chip) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oth { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .oth-h { font-size: 10.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #8aa0c4; margin-bottom: 2px; }
    .tie { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding: 6px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); font-size: 13px; }
    .tie.mine { box-shadow: 0 0 0 1px #34d399 inset; }
    .t { display: inline-flex; align-items: center; gap: 7px; color: #94a3b8; font-weight: 700; min-width: 0; overflow: hidden; white-space: nowrap; }
    .tr { justify-content: flex-end; }
    .t.w { color: #fff; }
    .tsc { font-weight: 900; color: #e2e8f0; }
    .lvls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: #34d399; margin-bottom: 12px; }
    .btns { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .btns .btn { padding: 11px 16px; font-size: 14px; }
    .hint { text-align: right; font-size: 11.5px; margin: 8px 0 0; }
</style>
