<script>
    import { UPDATES } from '../../utils/updates.js';
    import { switchTab } from '../../stores/ui.js';
</script>

<section class="updates">
    <div class="up-head">
        <div>
            <h2 class="up-title">Update Log</h2>
            <p class="up-desc">Every patch, in full. The newest release is at the top.</p>
        </div>
        <button class="up-guide-link" on:click={() => switchTab('guide')}>Game Guide →</button>
    </div>

    <div class="up-timeline">
        {#each UPDATES as note, i}
            <article class="up-entry" class:up-entry-latest={i === 0}>
                <div class="up-marker">
                    <span class="up-dot"></span>
                    {#if i < UPDATES.length - 1}<span class="up-line"></span>{/if}
                </div>
                <div class="up-body">
                    <div class="up-entry-head">
                        <span class="up-ver">{note.ver}</span>
                        {#if i === 0}<span class="up-latest-tag">Latest</span>{/if}
                        <h3 class="up-entry-title">{note.title}</h3>
                    </div>
                    <p class="up-summary">{note.summary}</p>
                    {#if note.details && note.details.length}
                        <ul class="up-details">
                            {#each note.details as line}
                                <li class="up-detail">{line}</li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            </article>
        {/each}
    </div>
</section>

<style>
    .updates { max-width: 820px; margin: 0 auto; padding-bottom: 48px; }

    .up-head {
        display: flex; align-items: flex-end; justify-content: space-between;
        gap: 16px; flex-wrap: wrap; margin-bottom: 28px;
    }
    .up-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .up-desc { font-size: 12px; color: #64748b; margin-top: 3px; }
    .up-guide-link {
        font-size: 11px; font-weight: 800; color: #93c5fd;
        background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.15);
        padding: 8px 14px; border-radius: 10px; cursor: pointer; transition: all 0.12s; white-space: nowrap;
    }
    .up-guide-link:hover { background: rgba(59,130,246,0.16); color: #bfdbfe; }

    /* Timeline */
    .up-timeline { display: flex; flex-direction: column; }
    .up-entry { display: grid; grid-template-columns: 22px 1fr; gap: 16px; }

    .up-marker { position: relative; display: flex; flex-direction: column; align-items: center; padding-top: 6px; }
    .up-dot {
        width: 12px; height: 12px; border-radius: 50%;
        background: #1e293b; border: 2px solid #334155; flex-shrink: 0; z-index: 1;
    }
    .up-entry-latest .up-dot {
        background: #06b6d4; border-color: #67e8f9;
        box-shadow: 0 0 12px rgba(6,182,212,0.5);
    }
    .up-line { flex: 1; width: 2px; background: linear-gradient(180deg, rgba(51,65,85,0.5), rgba(51,65,85,0.15)); margin-top: 2px; }

    .up-body {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 14px; padding: 18px 20px; margin-bottom: 16px;
    }
    .up-entry-latest .up-body { border-color: rgba(6,182,212,0.28); background: rgba(6,182,212,0.05); }

    .up-entry-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .up-ver {
        flex-shrink: 0; font-size: 10px; font-weight: 900; color: #06b6d4;
        background: rgba(6,182,212,0.1); padding: 3px 10px; border-radius: 6px;
        border: 1px solid rgba(6,182,212,0.18); letter-spacing: 0.5px;
    }
    .up-latest-tag {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        color: #67e8f9; background: rgba(6,182,212,0.14); border: 1px solid rgba(6,182,212,0.3);
        padding: 2px 8px; border-radius: 6px;
    }
    .up-entry-title { font-size: 15px; font-weight: 900; color: #e2e8f0; }
    .up-summary { font-size: 12px; color: #93c5fd; line-height: 1.6; margin-bottom: 12px; }

    .up-details { display: flex; flex-direction: column; gap: 8px; list-style: none; padding: 0; margin: 0; }
    .up-detail {
        position: relative; font-size: 12px; color: #94a3b8; line-height: 1.6;
        padding-left: 18px;
    }
    .up-detail::before {
        content: '▸'; position: absolute; left: 0; top: 0;
        color: #475569; font-size: 11px;
    }

    @media (max-width: 640px) {
        .up-entry { grid-template-columns: 14px 1fr; gap: 12px; }
        .up-body { padding: 14px 16px; }
    }
</style>
