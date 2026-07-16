<script>
    import Home from '../tabs/Home.svelte';
    import Welcome from '../tabs/Welcome.svelte';
    import Store from '../tabs/Store.svelte';
    import Club from '../tabs/Club.svelte';
    import Squad from '../tabs/Squad.svelte';
    import Academy from '../tabs/Academy.svelte';
    import Tournament from '../tabs/Tournament.svelte';
    import Archive from '../tabs/Archive.svelte';
    import Quests from '../tabs/Quests.svelte';
    import Skills from '../tabs/Skills.svelte';
    import Upgrade from '../tabs/Upgrade.svelte';
    import Season from '../tabs/Season.svelte';
    import Leaderboard from '../tabs/Leaderboard.svelte';
    import Trade from '../tabs/Trade.svelte';
    import Rewards from '../tabs/Rewards.svelte';
    import Guide from '../tabs/Guide.svelte';
    import Tower from '../tabs/Tower.svelte';
    import Draft from '../tabs/Draft.svelte';

    export let tab;
</script>

<div class="tab-content">
    {#if tab === 'home'}
        <Home />
    {:else if tab === 'welcome'}
        <Welcome />
    {:else if tab === 'store'}
        <Store />
    {:else if tab === 'club'}
        <Club />
    {:else if tab === 'squad'}
        <Squad />
    {:else if tab === 'academy'}
        <Academy />
    {:else if tab === 'tournament'}
        <Tournament />
    {:else if tab === 'collection'}
        <Archive />
    {:else if tab === 'quests'}
        <Quests />
    {:else if tab === 'skills'}
        <Skills />
    {:else if tab === 'upgrade'}
        <Upgrade />
    {:else if tab === 'season'}
        <Season />
    {:else if tab === 'leaderboard'}
        <Leaderboard />
    {:else if tab === 'trade'}
        <Trade />
    {:else if tab === 'rewards'}
        <Rewards />
    {:else if tab === 'guide'}
        <Guide />
    {:else if tab === 'tower'}
        <Tower />
    {:else if tab === 'draft'}
        <Draft />
    {:else}
        <section class="max-w-3xl mx-auto pt-10">
            <p class="text-slate-500 text-center font-mono text-sm">{tab} — coming soon</p>
        </section>
    {/if}
</div>
