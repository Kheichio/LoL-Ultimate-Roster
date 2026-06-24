<script>
    import Card from '../card/Card.svelte';
    import { inspectingCard } from '../../stores/ui.js';

    let rotX = 0, rotY = 0;

    function handleMouseMove(e) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        rotY = ((e.clientX - cx) / cx) * 15;
        rotX = ((cy - e.clientY) / cy) * 15;
    }

    function close() { inspectingCard.set(null); }
</script>

{#if $inspectingCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    class="fixed inset-0 z-[150] flex items-center justify-center cursor-pointer"
    style="background: radial-gradient(circle at center, rgba(15,23,42,0.95) 0%, rgba(0,0,0,0.98) 100%); perspective: 800px;"
    on:click={close}
    on:mousemove={handleMouseMove}
>
    <div class="pointer-events-none" style="transform: rotateY({rotY}deg) rotateX({rotX}deg); transform-style: preserve-3d; transition: transform 0.08s ease-out;">
        <Card card={$inspectingCard} />
    </div>
    <div class="absolute bottom-8 text-xs text-slate-600 font-mono pointer-events-none">Click anywhere to close · Move mouse to tilt</div>
</div>
{/if}
