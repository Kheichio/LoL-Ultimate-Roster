<script>
    // ===================================================================
    //  CAREER -- PROFILE
    // ===================================================================
    //  The owner's own dossier. Everything this screen used to be now lives in
    //  CareerDossier.svelte, which renders either this save or a stranger's
    //  downloaded off the global board -- the styles moved with it, because
    //  Svelte CSS is per-file scoped.
    //
    //  `mine` is what unlocks the two things that write: the signature-champion
    //  switch and the retirement overlay.

    import CareerDossier from './CareerDossier.svelte';
    import { career } from '../../stores/career.js';
</script>

<CareerDossier c={$career} mine={true} />
