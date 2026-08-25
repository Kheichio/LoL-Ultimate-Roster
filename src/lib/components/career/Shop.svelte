<script>
    // -----------------------------------------------------------------------
    //  CAREER - STORE
    // -----------------------------------------------------------------------
    //  Everything on this screen is driven by economy.shopSections(), which
    //  resolves every gate (gold, followers, legacy, prerequisites, sponsor
    //  slots) before the markup ever sees an item. The component renders flags
    //  and never re-derives a rule, so a balance change in economy.js lands
    //  here for free.

    import { onDestroy } from 'svelte';
    import { career, absWeek, saveCareer, consumableCount } from '../../stores/career.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { ATTR_BY_KEY } from '../../career/constants.js';
    import { fmtGold, fmtFollowers } from '../../career/ratings.js';
    import {
        shopSections, priceLabel, weeklyIncome, activeBuffs,
        activeSponsors, availableSponsors, MAX_ACTIVE_SPONSORS,
        buyGear, buyConsumable, useConsumable, buyLifestyle, buyPerk, signSponsor,
    } from '../../career/economy.js';

    // -- live view model ----------------------------------------------------
    $: sections   = shopSections($career);
    $: activeSec  = sections.find(s => s.id === tab) || sections[0];
    $: money      = $career.money;
    $: income     = weeklyIncome($career);
    $: buffs      = activeBuffs($career);
    $: nowWeek    = absWeek($career);
    $: deals      = activeSponsors($career);
    $: openDeals  = new Set(availableSponsors($career).map(d => d.id));
    $: slotsFull  = deals.length >= MAX_ACTIVE_SPONSORS;

    let tab = 'gear';

    function go(id) {
        if (tab === id) return;
        playSound('click');
        tab = id;
    }

    function tabKey(e, id) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(id); }
    }

    // -- gear ladder selection ---------------------------------------------
    //  Each category remembers which rung the player is inspecting. Nothing is
    //  stored in the save: it resets to "the tier you would buy next" whenever
    //  the screen is re-entered, which is the tier you almost always want.
    let picked = {};

    function selectedTier(cat) {
        const manual = picked[cat.id];
        if (manual && manual >= 1 && manual <= cat.maxTier) return manual;
        if (cat.tier) return cat.tier.tier;
        return Math.max(1, cat.ownedTier);
    }

    function selectTier(catId, tier) {
        playSound('click');
        picked = { ...picked, [catId]: tier };
    }

    function rungKey(e, catId, tier) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTier(catId, tier); }
    }

    // -- purchase plumbing --------------------------------------------------
    //  economy.js already plays the success sound and calls saveCareer(); the
    //  extra save here is debounced and free, and the failure sound is the one
    //  thing the module deliberately leaves to the screen.
    function report(res) {
        if (!res) return false;
        if (res.ok) {
            showToast(res.msg, 'success');
        } else {
            playSound('lose');
            showToast(res.msg, 'error');
        }
        saveCareer();
        return res.ok;
    }

    function onBuyGear(catId, tier)  { report(buyGear(catId, tier)); }
    function onBuyConsumable(id, n)  { report(buyConsumable(id, n)); }
    function onUseConsumable(id) {
        if (consumableCount(id) < 1) {
            playSound('lose');
            showToast('You have none of those left.', 'error');
            return;
        }
        report(useConsumable(id));
    }
    function onBuyLifestyle(id)      { report(buyLifestyle(id)); }
    function onBuyPerk(id)           { report(buyPerk(id)); }
    function onSignSponsor(id)       { report(signSponsor(id)); }

    // -- formatting helpers -------------------------------------------------
    function pct(v) {
        const n = (Number(v) || 0) * 100;
        const s = Math.abs(n) < 10 ? n.toFixed(1) : String(Math.round(n));
        return (s.endsWith('.0') ? s.slice(0, -2) : s) + '%';
    }

    function attrEntries(map) {
        if (!map) return [];
        return Object.keys(map)
            .filter(k => ATTR_BY_KEY[k] && map[k])
            .map(k => [k, map[k]]);
    }

    /** One human line for every effect key used by lifestyle items and perks. */
    function describeEffect(key, value) {
        const v = Number(value) || 0;
        switch (key) {
            case 'energyRegen':      return `+${v} energy every week`;
            case 'extraActions':     return `+${v} activity slot${v > 1 ? 's' : ''} every week`;
            case 'moraleFloor':      return `Morale never falls below ${v}`;
            case 'formFloor':        return `Form never falls below ${v}`;
            case 'injuryResist':     return `${pct(v)} less injury risk`;
            case 'followerMult':     return `+${pct(v)} follower growth`;
            case 'trainingMult':     return `+${pct(v)} training gains`;
            case 'growthMult':       return `+${pct(v)} on everything you practise`;
            case 'offerBonus':       return `+${pct(v)} on contract offers`;
            case 'salaryMult':       return `+${pct(v)} wages`;
            case 'valueMult':        return `+${pct(v)} market value`;
            case 'decayMult':        return `Age decay runs at ${pct(v)} speed`;
            case 'unsignedCapBonus': return `+${v} to the unsigned soft cap`;
            case 'ceilingBonus':     return `+${v} to every attribute ceiling, permanently`;
            case 'chemistryBonus':   return `+${v} starting chemistry`;
            case 'extraChampion':    return `+${v} signature champion`;
            case 'clutchBonus':      return `+${pct(v)} in elimination games`;
            case 'intlBonus':        return `+${pct(v)} at MSI and Worlds`;
            default:                 return `${key}: ${v}`;
        }
    }

    function effectLines(map) {
        if (!map) return [];
        return Object.keys(map).filter(k => map[k]).map(k => describeEffect(k, map[k]));
    }

    /** Consumable effect blocks are a different shape - short chips, not lines. */
    function effectChips(effect) {
        const out = [];
        if (!effect) return out;
        const cond = effect.condition || {};
        for (const f of ['energy', 'morale', 'health', 'form']) {
            const d = Number(cond[f]) || 0;
            if (!d) continue;
            out.push({ text: `${d > 0 ? '+' : ''}${d} ${f}`, bad: d < 0 });
        }
        const xp = effect.attrXP || {};
        for (const k of Object.keys(xp)) {
            const v = Number(xp[k]) || 0;
            if (!v) continue;
            if (k === 'ALL') out.push({ text: `+${v} all attributes`, bad: false });
            else if (k === 'ROLE_PRIMARY') out.push({ text: `+${v} main attribute`, bad: false });
            else if (ATTR_BY_KEY[k]) out.push({ text: `+${v} ${ATTR_BY_KEY[k].abbr}`, bad: false, color: ATTR_BY_KEY[k].color });
        }
        // Ceiling points are not attribute points. They are the only renewable
        // way to raise the roof, so they get their own chip rather than reading
        // like a slightly bigger training session.
        const pot = effect.potentialXP || {};
        for (const k of Object.keys(pot)) {
            const v = Number(pot[k]) || 0;
            if (!v) continue;
            if (k === 'ALL') out.push({ text: `+${v} to every ceiling`, bad: false });
            else if (k === 'ROLE_PRIMARY') out.push({ text: `+${v} main attribute ceiling`, bad: false });
            else if (ATTR_BY_KEY[k]) out.push({ text: `+${v} ${ATTR_BY_KEY[k].abbr} ceiling`, bad: false, color: ATTR_BY_KEY[k].color });
        }
        if (effect.chemistry) out.push({ text: `+${effect.chemistry} chemistry`, bad: false });
        if (effect.followers) out.push({ text: `+${fmtFollowers(effect.followers)} followers`, bad: false });
        if (effect.gold) out.push({ text: `+${fmtGold(effect.gold)} gold`, bad: false });
        if (effect.actions) out.push({ text: `+${effect.actions} activity slot`, bad: false });
        if (effect.buff && effect.buff.key) {
            out.push({ text: `${effect.buff.name || effect.buff.key} for ${effect.buff.weeks}w`, bad: false });
        }
        if (effect.needsClub) out.push({ text: 'Club only', bad: true });
        return out;
    }

    function describeBuff(b) {
        const v = Number(b.value) || 0;
        if (b.key === 'trainingMult') return `+${pct(v)} training`;
        if (b.key === 'injuryResist') return `${pct(v)} less injury risk`;
        if (b.key === 'offerBonus')   return `+${pct(v)} on offers`;
        return describeEffect(b.key, v);
    }

    /** Small counter on each tab so progress is visible without opening it. */
    function tabMeta(s) {
        if (s.id === 'gear') {
            const owned = s.items.reduce((n, c) => n + c.ownedTier, 0);
            return `${owned}/${s.items.length * 5}`;
        }
        if (s.id === 'consumables') {
            const held = s.items.reduce((n, i) => n + i.held, 0);
            return held > 0 ? `${held} held` : '';
        }
        if (s.id === 'lifestyle' || s.id === 'perks') {
            return `${s.items.filter(i => i.owned).length}/${s.items.length}`;
        }
        if (s.id === 'sponsors') return `${deals.length}/${MAX_ACTIVE_SPONSORS}`;
        return '';
    }

    /** Cheapest deal still out of reach - used for the sponsor empty state. */
    function nextSponsorTarget(items) {
        const rest = items.filter(i => !i.owned && i.locked);
        if (!rest.length) return null;
        return rest.slice().sort((a, b) => a.reqFollowers - b.reqFollowers)[0];
    }

    function termLength(d) {
        return Math.max(1, (Number(d.endWeekAbs) || 0) - (Number(d.startWeekAbs) || 0));
    }

    // Quantity stepper for consumables. Local, never persisted.
    let bulk = 1;
    const BULK_STEPS = [1, 3, 5];

    onDestroy(() => { saveCareer(); });
</script>

<section class="shop">
    <!-- ============ HEADER ============ -->
    <div class="sh-top">
        <div class="sh-title">
            <h2 class="sh-h">Store</h2>
            <p class="sh-sub">Hardware, habits, and the brands that want your name on something.</p>
        </div>
    </div>

    <!-- ============ WALLET ============ -->
    <div class="wallet" role="group" aria-label="Your money">
        <div class="w-cell">
            <span class="w-ico" aria-hidden="true">&#x1F4B0;</span>
            <span class="w-body">
                <span class="w-val">{fmtGold(money.gold)}</span>
                <span class="w-lbl">Gold</span>
            </span>
        </div>
        <div class="w-cell">
            <span class="w-ico" aria-hidden="true">&#x1F464;</span>
            <span class="w-body">
                <span class="w-val">{fmtFollowers(money.followers)}</span>
                <span class="w-lbl">Followers</span>
            </span>
        </div>
        <div class="w-cell">
            <span class="w-ico" aria-hidden="true">&#x1F3C6;</span>
            <span class="w-body">
                <span class="w-val">{money.legacy}</span>
                <span class="w-lbl">Legacy Points</span>
            </span>
        </div>
        <div class="w-cell w-inc">
            <span class="w-ico" aria-hidden="true">&#x1F4C8;</span>
            <span class="w-body">
                <span class="w-val w-plus">+{fmtGold(income.total)} / week</span>
                <span class="w-lbl">
                    {#if income.total > 0}
                        {fmtGold(income.salary)} wage &middot; {fmtGold(income.sponsors)} sponsors
                    {:else}
                        No wage, no deals - nothing coming in yet
                    {/if}
                </span>
            </span>
        </div>
    </div>

    <!-- ============ ACTIVE BUFFS ============ -->
    {#if buffs.length}
        <div class="buffs" role="group" aria-label="Active effects">
            <span class="buffs-lbl">Ticking</span>
            {#each buffs as b (b.id)}
                <span class="buff" title={describeBuff(b)}>
                    <span class="buff-n">{b.name}</span>
                    <span class="buff-v">{describeBuff(b)}</span>
                    <span class="buff-w">{Math.max(0, b.endWeekAbs - nowWeek)}w left</span>
                </span>
            {/each}
        </div>
    {/if}

    <!-- ============ TABS ============ -->
    <div class="rail" role="tablist" aria-label="Store sections">
        {#each sections as s (s.id)}
            <button
                class="rtab"
                class:rtab-on={tab === s.id}
                role="tab"
                aria-selected={tab === s.id}
                on:click={() => go(s.id)}
                on:keydown={(e) => tabKey(e, s.id)}
            >
                <span class="rtab-t">{s.name}</span>
                {#if tabMeta(s)}<span class="rtab-m">{tabMeta(s)}</span>{/if}
            </button>
        {/each}
    </div>

    {#if activeSec}
        <p class="rail-blurb">{activeSec.blurb}</p>

        <div class="sec" role="tabpanel" aria-label={activeSec.name}>

            <!-- ============ GEAR ============ -->
            {#if activeSec.id === 'gear'}
                <p class="sec-note">
                    Attribute bonuses from gear apply in matches only. They never raise your OVR and they
                    vanish the moment the hardware is replaced.
                </p>
                <div class="gear-grid">
                    {#each activeSec.items as cat (cat.id)}
                        {@const sel = selectedTier(cat)}
                        {@const t = cat.tiers[sel - 1]}
                        <article class="gcard" class:gcard-max={cat.owned}>
                            <header class="g-head">
                                <span class="g-ico" aria-hidden="true">{cat.icon}</span>
                                <span class="g-id">
                                    <span class="g-name">{cat.name}</span>
                                    <span class="g-desc">{cat.desc}</span>
                                </span>
                                <span class="g-badge" class:g-badge-max={cat.owned}>{cat.ownedTier}/{cat.maxTier}</span>
                            </header>

                            <div class="ladder" role="group" aria-label="{cat.name} upgrade tiers">
                                {#each cat.tiers as tt (tt.tier)}
                                    <button
                                        class="rung"
                                        class:rung-owned={tt.owned}
                                        class:rung-next={tt.next}
                                        class:rung-sel={tt.tier === sel}
                                        aria-pressed={tt.tier === sel}
                                        aria-label="Tier {tt.tier}, {tt.name}{tt.owned ? ', owned' : ''}"
                                        title="{tt.name} - {tt.owned ? 'owned' : priceLabel(tt)}"
                                        on:click={() => selectTier(cat.id, tt.tier)}
                                        on:keydown={(e) => rungKey(e, cat.id, tt.tier)}
                                    >
                                        <span class="rung-n">{tt.tier}</span>
                                    </button>
                                {/each}
                            </div>

                            {#if t}
                                <div class="g-detail">
                                    <div class="g-d-top">
                                        <span class="g-d-tier">Tier {t.tier}</span>
                                        <span class="g-d-name">{t.name}</span>
                                        {#if t.current}
                                            <span class="pill pill-on">On the desk</span>
                                        {:else if t.owned}
                                            <span class="pill">Owned</span>
                                        {/if}
                                    </div>
                                    <p class="g-d-desc">{t.desc}</p>
                                    <div class="chips">
                                        <span class="chip chip-train">+{pct(t.trainingBonus)} training</span>
                                        {#if t.energyBonus}
                                            <span class="chip chip-energy">+{t.energyBonus} energy / week</span>
                                        {/if}
                                        {#each attrEntries(t.attrBonus) as [k, v] (k)}
                                            <span class="chip chip-attr" style="--ac:{ATTR_BY_KEY[k].color}">+{v} {ATTR_BY_KEY[k].abbr}</span>
                                        {/each}
                                    </div>
                                    <div class="g-buy">
                                        {#if t.owned}
                                            <span class="g-owned-note">
                                                {t.current ? 'This is what you are playing on.' : 'Already been through this one.'}
                                            </span>
                                        {:else if !t.locked}
                                            <button class="buy" on:click={() => onBuyGear(cat.id, t.tier)}>
                                                Buy &middot; {priceLabel(t)}
                                            </button>
                                        {:else}
                                            <button class="buy buy-off" disabled>{t.lockReason || 'Locked'}</button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </article>
                    {/each}
                </div>

            <!-- ============ CONSUMABLES ============ -->
            {:else if activeSec.id === 'consumables'}
                <div class="bulk-row">
                    <span class="bulk-lbl">Buy quantity</span>
                    <div class="bulk-btns" role="group" aria-label="Purchase quantity">
                        {#each BULK_STEPS as n}
                            <button
                                class="bulk-b"
                                class:bulk-on={bulk === n}
                                aria-pressed={bulk === n}
                                on:click={() => { bulk = n; playSound('click'); }}
                            >x{n}</button>
                        {/each}
                    </div>
                </div>
                <div class="cons-grid">
                    {#each activeSec.items as item (item.id)}
                        <article class="ccard" class:ccard-held={item.held > 0}>
                            <header class="c-head">
                                <span class="c-ico" aria-hidden="true">{item.icon}</span>
                                <span class="c-id">
                                    <span class="c-name">{item.name}</span>
                                    <span class="c-cost">{priceLabel(item)}{bulk > 1 ? ' each' : ''}</span>
                                </span>
                                {#if item.held > 0}
                                    <span class="c-held" title="In the bag">x{item.held}</span>
                                {/if}
                            </header>
                            <p class="c-desc">{item.desc}</p>
                            <div class="chips">
                                {#each effectChips(item.effect) as ch, i (i)}
                                    <span class="chip" class:chip-bad={ch.bad} class:chip-attr={!!ch.color} style={ch.color ? '--ac:' + ch.color : ''}>{ch.text}</span>
                                {/each}
                            </div>
                            <div class="c-actions">
                                {#if item.locked}
                                    <button class="buy buy-off" disabled>{item.lockReason || 'Locked'}</button>
                                {:else}
                                    <button class="buy" on:click={() => onBuyConsumable(item.id, bulk)}>
                                        Buy{bulk > 1 ? ' x' + bulk : ''} &middot; {fmtGold(item.cost * bulk)} G
                                    </button>
                                {/if}
                                <button
                                    class="use"
                                    disabled={!item.usable}
                                    title={item.usable ? 'Use one ' + item.name : 'Nothing in the bag'}
                                    on:click={() => onUseConsumable(item.id)}
                                >Use</button>
                            </div>
                        </article>
                    {/each}
                </div>

            <!-- ============ LIFESTYLE ============ -->
            {:else if activeSec.id === 'lifestyle'}
                <div class="perm-grid">
                    {#each activeSec.items as item (item.id)}
                        <article class="pcard" class:pcard-owned={item.owned}>
                            <header class="p-head">
                                <span class="p-ico" aria-hidden="true">{item.icon}</span>
                                <span class="p-id">
                                    <span class="p-name">{item.name}</span>
                                    <span class="p-meta">
                                        <span class="p-cost">{priceLabel(item)}</span>
                                        {#if item.reqFollowers > 0}
                                            <span class="p-req">{fmtFollowers(item.reqFollowers)} followers</span>
                                        {/if}
                                    </span>
                                </span>
                                {#if item.owned}<span class="pill pill-on">Owned</span>{/if}
                            </header>
                            <p class="p-desc">{item.desc}</p>
                            <ul class="eff-list">
                                {#each effectLines(item.effects) as line, i (i)}
                                    <li>{line}</li>
                                {/each}
                            </ul>
                            {#if item.owned}
                                <button class="buy buy-owned" disabled>Permanent &middot; yours</button>
                            {:else if item.locked}
                                <button class="buy buy-off" disabled>{item.lockReason || 'Locked'}</button>
                            {:else}
                                <button class="buy" on:click={() => onBuyLifestyle(item.id)}>Buy &middot; {priceLabel(item)}</button>
                            {/if}
                        </article>
                    {/each}
                </div>

            <!-- ============ LEGACY PERKS ============ -->
            {:else if activeSec.id === 'perks'}
                {#if money.legacy === 0 && !activeSec.items.some(i => i.owned)}
                    <div class="empty">
                        <span class="empty-ico" aria-hidden="true">&#x1F3C6;</span>
                        <h3 class="empty-h">No legacy points yet</h3>
                        <p class="empty-p">
                            Legacy is the one currency you cannot earn by playing well - only trophies, end-of-split
                            awards and career milestones pay it out. Win something, then come back and spend it.
                        </p>
                    </div>
                {/if}
                <div class="perm-grid">
                    {#each activeSec.items as perk (perk.id)}
                        <article class="pcard pcard-legacy" class:pcard-owned={perk.owned}>
                            <header class="p-head">
                                <span class="p-ico" aria-hidden="true">{perk.icon}</span>
                                <span class="p-id">
                                    <span class="p-name">{perk.name}</span>
                                    <span class="p-meta"><span class="p-cost p-lp">{priceLabel(perk)}</span></span>
                                </span>
                                {#if perk.owned}<span class="pill pill-on">Unlocked</span>{/if}
                            </header>
                            <p class="p-desc">{perk.desc}</p>
                            <ul class="eff-list">
                                {#each effectLines(perk.effect) as line, i (i)}
                                    <li>{line}</li>
                                {/each}
                            </ul>
                            {#if perk.owned}
                                <button class="buy buy-owned" disabled>Unlocked for good</button>
                            {:else if perk.locked}
                                <button class="buy buy-off" disabled>{perk.lockReason || 'Locked'}</button>
                            {:else}
                                <button class="buy buy-lp" on:click={() => onBuyPerk(perk.id)}>Unlock &middot; {priceLabel(perk)}</button>
                            {/if}
                        </article>
                    {/each}
                </div>

            <!-- ============ SPONSORS ============ -->
            {:else if activeSec.id === 'sponsors'}
                <div class="side-label">Current deals &middot; {deals.length} / {MAX_ACTIVE_SPONSORS}</div>
                {#if deals.length}
                    <div class="deal-grid">
                        {#each deals as d (d.id)}
                            {@const left = Math.max(0, d.endWeekAbs - nowWeek)}
                            {@const term = termLength(d)}
                            <article class="deal">
                                <span class="deal-ico" aria-hidden="true">{d.icon || '\u{1F4BC}'}</span>
                                <span class="deal-body">
                                    <span class="deal-top">
                                        <span class="deal-name">{d.name}</span>
                                        {#if d.tier}<span class="tierchip">{d.tier}</span>{/if}
                                    </span>
                                    <span class="deal-sub">{fmtGold(d.weekly)} G a week &middot; {left} of {term} weeks left</span>
                                    <span class="deal-bar" aria-hidden="true">
                                        <span class="deal-fill" style="width:{Math.max(2, Math.min(100, (left / term) * 100))}%"></span>
                                    </span>
                                </span>
                            </article>
                        {/each}
                    </div>
                {:else}
                    <div class="empty empty-sm">
                        <span class="empty-ico" aria-hidden="true">&#x1F4BC;</span>
                        <h3 class="empty-h">No brand deals</h3>
                        <p class="empty-p">
                            {#if nextSponsorTarget(activeSec.items)}
                                {@const tgt = nextSponsorTarget(activeSec.items)}
                                Sponsors buy an audience, not a trophy cabinet. The first name on the board is
                                {tgt.name}. {tgt.lockReason}
                            {:else}
                                Nothing signed right now. Every deal below is open to you.
                            {/if}
                        </p>
                    </div>
                {/if}

                {#if slotsFull}
                    <p class="sec-note sec-warn">
                        All {MAX_ACTIVE_SPONSORS} sponsor slots are full. Nothing new can be signed until one of the
                        deals above runs its term out.
                    </p>
                {/if}

                <div class="side-label side-label-2">On the board</div>
                <div class="perm-grid">
                    {#each activeSec.items.filter(i => !i.owned) as s (s.id)}
                        <article class="pcard pcard-sponsor" class:pcard-open={openDeals.has(s.id) && !slotsFull}>
                            <header class="p-head">
                                <span class="p-ico" aria-hidden="true">{s.icon}</span>
                                <span class="p-id">
                                    <span class="p-name">{s.name}</span>
                                    <span class="p-meta">
                                        <span class="tierchip">{s.tier}</span>
                                        <span class="p-cost p-pay">{fmtGold(s.weekly)} G / week</span>
                                    </span>
                                </span>
                                {#if openDeals.has(s.id) && !slotsFull}<span class="pill pill-open">Open</span>{/if}
                            </header>
                            <p class="p-desc">{s.desc}</p>
                            <div class="chips">
                                <span class="chip chip-pay">{fmtGold(s.signingBonus)} G signing bonus</span>
                                <span class="chip">{s.lengthWeeks} week term</span>
                                <span class="chip" class:chip-bad={money.followers < s.reqFollowers}>{fmtFollowers(s.reqFollowers)} followers</span>
                                {#if s.reqOVR}
                                    <span class="chip">{s.reqOVR} OVR</span>
                                {/if}
                            </div>
                            {#if s.locked}
                                <button class="buy buy-off" disabled>{s.lockReason || 'Locked'}</button>
                            {:else}
                                <button class="buy buy-pay" on:click={() => onSignSponsor(s.id)}>
                                    Sign &middot; {fmtGold(s.signingBonus)} G up front
                                </button>
                            {/if}
                        </article>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</section>

<style>
    .shop { max-width: 1240px; margin: 0 auto; padding-bottom: 40px; }

    /* ---------- header ---------- */
    .sh-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
    .sh-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 22px; font-weight: 800; letter-spacing: -0.01em; color: #e8eefb;
    }
    .sh-sub { font-size: 12px; color: #56688a; margin-top: 3px; max-width: 560px; line-height: 1.5; }

    /* ---------- wallet ---------- */
    .wallet {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 16px;
        padding: 14px 16px;
        margin-bottom: 12px;
    }
    .w-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .w-ico { font-size: 16px; opacity: 0.85; flex-shrink: 0; }
    .w-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .w-val {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 16px; font-weight: 800; color: #e2e8f0; line-height: 1.1;
    }
    .w-lbl {
        font-size: 9px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        color: #3f5069; line-height: 1.3;
    }
    .w-inc { border-left: 1px solid rgba(51, 65, 85, 0.28); padding-left: 14px; }
    .w-plus { color: #34d399; }
    .w-inc .w-lbl { text-transform: none; letter-spacing: 0.2px; font-size: 10px; font-weight: 600; color: #4a5b76; }

    /* ---------- buffs ---------- */
    .buffs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .buffs-lbl {
        font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #334155;
    }
    .buff {
        display: inline-flex; align-items: baseline; gap: 8px;
        padding: 6px 11px; border-radius: 999px;
        background: rgba(139, 92, 246, 0.10);
        border: 1px solid rgba(139, 92, 246, 0.26);
    }
    .buff-n { font-size: 11px; font-weight: 800; color: #c4b5fd; }
    .buff-v { font-size: 10px; font-weight: 600; color: #7c8db0; }
    .buff-w {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 700; color: #a78bfa;
    }

    /* ---------- tab rail ---------- */
    .rail {
        display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
        padding: 5px; border-radius: 14px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.24);
    }
    .rail::-webkit-scrollbar { display: none; }
    .rtab {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 9px 15px; border-radius: 10px;
        border: 1px solid transparent; background: transparent;
        font-family: inherit; font-size: 12px; font-weight: 700; color: #64748b;
        white-space: nowrap; cursor: pointer; transition: all 0.12s;
    }
    .rtab:hover { color: #cbd5e1; background: rgba(51, 65, 85, 0.3); }
    .rtab-on {
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.12);
        border-color: rgba(139, 92, 246, 0.28);
    }
    .rtab-m {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 9.5px; font-weight: 800; color: #475569;
        padding: 2px 6px; border-radius: 5px; background: rgba(15, 23, 42, 0.7);
    }
    .rtab-on .rtab-m { color: #a78bfa; background: rgba(139, 92, 246, 0.14); }
    .rail-blurb {
        font-size: 12px; color: #56688a; line-height: 1.6;
        margin: 12px 2px 18px; max-width: 780px;
    }

    .sec-note {
        font-size: 11px; color: #4a5b76; line-height: 1.6;
        background: rgba(12, 16, 28, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-left: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;
    }
    .sec-warn { border-left-color: rgba(245, 158, 11, 0.55); color: #b08a4a; }

    .side-label {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px;
        color: #334155; margin-bottom: 10px;
    }
    .side-label-2 { margin-top: 26px; }

    /* ---------- shared card furniture ---------- */
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
        font-size: 9.5px; font-weight: 800; letter-spacing: 0.3px;
        padding: 4px 8px; border-radius: 6px;
        color: #8195b5;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(51, 65, 85, 0.3);
        white-space: nowrap;
    }
    .chip-train { color: #a78bfa; background: rgba(139, 92, 246, 0.10); border-color: rgba(139, 92, 246, 0.24); }
    .chip-energy { color: #38bdf8; background: rgba(56, 189, 248, 0.10); border-color: rgba(56, 189, 248, 0.22); }
    .chip-pay { color: #34d399; background: rgba(16, 185, 129, 0.10); border-color: rgba(16, 185, 129, 0.24); }
    .chip-bad { color: #f87171; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.2); }
    .chip-attr {
        color: var(--ac, #8195b5);
        background: color-mix(in srgb, var(--ac, #64748b) 12%, transparent);
        border-color: color-mix(in srgb, var(--ac, #64748b) 30%, transparent);
    }

    .pill {
        font-size: 8.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;
        padding: 4px 8px; border-radius: 6px; white-space: nowrap;
        color: #64748b; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.35);
    }
    .pill-on { color: #34d399; background: rgba(16, 185, 129, 0.10); border-color: rgba(16, 185, 129, 0.28); }
    .pill-open { color: #a78bfa; background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3); }

    .buy {
        width: 100%; padding: 10px 14px; border-radius: 11px; border: 1px solid transparent;
        font-family: inherit; font-size: 11.5px; font-weight: 800; letter-spacing: 0.3px;
        color: #0b1020; cursor: pointer;
        background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
        transition: transform 0.12s, box-shadow 0.12s;
    }
    .buy:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(139, 92, 246, 0.32); }
    .buy-lp { background: linear-gradient(135deg, #d97706 0%, #fbbf24 100%); color: #1c1917; }
    .buy-lp:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(245, 158, 11, 0.35); }
    .buy-pay { background: linear-gradient(135deg, #059669 0%, #34d399 100%); color: #042f22; }
    .buy-pay:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(16, 185, 129, 0.32); }
    .buy-off, .buy-owned {
        background: rgba(15, 23, 42, 0.65); color: #4a5b76;
        border-color: rgba(51, 65, 85, 0.32); cursor: not-allowed;
    }
    .buy-owned { color: #34d399; border-color: rgba(16, 185, 129, 0.22); background: rgba(16, 185, 129, 0.06); }

    /* ---------- gear ---------- */
    .gear-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
        gap: 14px;
    }
    .gcard {
        display: flex; flex-direction: column; gap: 12px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.26);
        border-radius: 18px; padding: 16px;
    }
    .gcard-max { border-color: rgba(16, 185, 129, 0.24); }
    .g-head { display: flex; align-items: flex-start; gap: 11px; }
    .g-ico { font-size: 20px; line-height: 1; flex-shrink: 0; }
    .g-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .g-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 15px; font-weight: 700; color: #e2e8f0;
    }
    .g-desc { font-size: 10.5px; color: #4a5b76; line-height: 1.5; }
    .g-badge {
        flex-shrink: 0;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #64748b;
        padding: 4px 8px; border-radius: 7px;
        background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.32);
    }
    .g-badge-max { color: #34d399; border-color: rgba(16, 185, 129, 0.3); }

    .ladder { display: flex; align-items: stretch; gap: 5px; }
    .rung {
        flex: 1; min-width: 0; height: 30px;
        display: grid; place-items: center;
        border-radius: 8px; cursor: pointer;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.28);
        transition: all 0.12s;
    }
    .rung-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #3f5069;
    }
    .rung:hover { border-color: rgba(139, 92, 246, 0.4); }
    .rung-owned { background: rgba(139, 92, 246, 0.22); border-color: rgba(139, 92, 246, 0.4); }
    .rung-owned .rung-n { color: #ddd6fe; }
    .rung-next { border-color: rgba(139, 92, 246, 0.45); border-style: dashed; }
    .rung-next .rung-n { color: #a78bfa; }
    .rung-sel { box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.35); }

    .g-detail {
        display: flex; flex-direction: column; gap: 9px;
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.22);
        border-radius: 13px; padding: 13px;
        margin-top: auto;
    }
    .g-d-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .g-d-tier {
        font-size: 8.5px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069;
    }
    .g-d-name { font-size: 13px; font-weight: 800; color: #cbd5e1; flex: 1; min-width: 0; }
    .g-d-desc { font-size: 10.5px; color: #56688a; line-height: 1.55; }
    .g-buy { margin-top: 2px; }
    .g-owned-note {
        display: block; text-align: center; font-size: 10px; font-weight: 700;
        color: #34d399; padding: 8px 0;
    }

    /* ---------- consumables ---------- */
    .bulk-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .bulk-lbl {
        font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #334155;
    }
    .bulk-btns { display: flex; gap: 4px; }
    .bulk-b {
        padding: 5px 11px; border-radius: 8px;
        background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.3);
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #64748b; cursor: pointer;
    }
    .bulk-b:hover { color: #cbd5e1; }
    .bulk-on { color: #c4b5fd; background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3); }

    .cons-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
        gap: 12px;
    }
    .ccard {
        display: flex; flex-direction: column; gap: 10px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.26);
        border-radius: 16px; padding: 14px;
    }
    .ccard-held { border-color: rgba(139, 92, 246, 0.26); }
    .c-head { display: flex; align-items: flex-start; gap: 10px; }
    .c-ico { font-size: 18px; line-height: 1; flex-shrink: 0; }
    .c-id { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .c-name { font-size: 13px; font-weight: 800; color: #e2e8f0; line-height: 1.25; }
    .c-cost {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10.5px; font-weight: 700; color: #f59e0b;
    }
    .c-held {
        flex-shrink: 0;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #c4b5fd;
        padding: 3px 8px; border-radius: 6px;
        background: rgba(139, 92, 246, 0.12); border: 1px solid rgba(139, 92, 246, 0.28);
    }
    .c-desc { font-size: 10.5px; color: #56688a; line-height: 1.55; flex: 1; }
    .c-actions { display: flex; gap: 7px; }
    .c-actions .buy { flex: 1; }
    .use {
        flex-shrink: 0; padding: 10px 16px; border-radius: 11px;
        font-family: inherit; font-size: 11.5px; font-weight: 800;
        color: #cbd5e1; cursor: pointer;
        background: rgba(51, 65, 85, 0.5); border: 1px solid rgba(71, 85, 105, 0.4);
    }
    .use:hover:not(:disabled) { background: rgba(71, 85, 105, 0.65); color: #f1f5f9; }
    .use:disabled { color: #3f5069; background: rgba(15, 23, 42, 0.5); border-color: rgba(51, 65, 85, 0.25); cursor: not-allowed; }

    /* ---------- lifestyle / perks / sponsors ---------- */
    .perm-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        gap: 12px;
    }
    .pcard {
        display: flex; flex-direction: column; gap: 10px;
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.26);
        border-radius: 16px; padding: 15px;
    }
    .pcard-owned { border-color: rgba(16, 185, 129, 0.26); background: rgba(16, 185, 129, 0.04); }
    .pcard-legacy.pcard-owned { border-color: rgba(245, 158, 11, 0.28); background: rgba(245, 158, 11, 0.04); }
    .pcard-open { border-color: rgba(139, 92, 246, 0.3); }
    .p-head { display: flex; align-items: flex-start; gap: 10px; }
    .p-ico { font-size: 19px; line-height: 1; flex-shrink: 0; }
    .p-id { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
    .p-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 14px; font-weight: 700; color: #e2e8f0; line-height: 1.25;
    }
    .p-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
    .p-cost {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10.5px; font-weight: 800; color: #f59e0b;
    }
    .p-lp { color: #fbbf24; }
    .p-pay { color: #34d399; }
    .p-req { font-size: 9.5px; font-weight: 700; color: #4a5b76; }
    .p-desc { font-size: 10.5px; color: #56688a; line-height: 1.55; }
    .eff-list { list-style: none; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .eff-list li {
        position: relative; padding-left: 12px;
        font-size: 10.5px; font-weight: 600; color: #8195b5; line-height: 1.45;
    }
    .eff-list li::before {
        content: ''; position: absolute; left: 0; top: 6px;
        width: 4px; height: 4px; border-radius: 50%; background: rgba(139, 92, 246, 0.7);
    }
    .tierchip {
        font-size: 8.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;
        padding: 3px 7px; border-radius: 5px;
        color: #7c8db0; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.32);
    }

    /* current sponsor deals */
    .deal-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 10px;
    }
    .deal {
        display: flex; align-items: center; gap: 12px;
        background: rgba(16, 185, 129, 0.05);
        border: 1px solid rgba(16, 185, 129, 0.24);
        border-radius: 14px; padding: 13px 15px;
    }
    .deal-ico { font-size: 18px; flex-shrink: 0; }
    .deal-body { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
    .deal-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .deal-name { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .deal-sub {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 700; color: #4a5b76;
    }
    .deal-bar { height: 3px; border-radius: 3px; background: rgba(148, 163, 184, 0.14); overflow: hidden; }
    .deal-fill { display: block; height: 100%; border-radius: 3px; background: #34d399; }

    /* ---------- empty states ---------- */
    .empty {
        text-align: center; max-width: 540px; margin: 10px auto 22px;
        padding: 32px 24px; border-radius: 18px;
        background: rgba(12, 16, 28, 0.5); border: 1px dashed rgba(51, 65, 85, 0.34);
    }
    .empty-sm { padding: 22px 20px; margin-bottom: 18px; }
    .empty-ico { font-size: 30px; display: block; margin-bottom: 10px; opacity: 0.55; }
    .empty-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 15px; font-weight: 700; color: #cbd5e1; margin-bottom: 7px;
    }
    .empty-p { font-size: 11.5px; color: #56688a; line-height: 1.65; }

    /* ---------- responsive ---------- */
    @media (max-width: 720px) {
        .sh-h { font-size: 19px; }
        .wallet { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; }
        .w-inc { grid-column: 1 / -1; border-left: none; padding-left: 0; border-top: 1px solid rgba(51, 65, 85, 0.28); padding-top: 10px; }
        .gear-grid, .cons-grid, .perm-grid, .deal-grid { grid-template-columns: minmax(0, 1fr); }
        .rtab { padding: 8px 12px; font-size: 11.5px; }
    }
    @media (max-width: 380px) {
        .wallet { grid-template-columns: minmax(0, 1fr); }
        .c-actions { flex-direction: column; }
        .use { width: 100%; }
        .gcard, .ccard, .pcard { padding: 12px; }
    }
</style>
