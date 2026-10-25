// League logos for the six regions, drawn by components/ui/RegionIcon.svelte in both gamemodes.
//
// The originals are in /Icons (as supplied); the copies the game serves are in public/regions/.
// The PNGs there are TRIMMED to the logo's visible edges and scaled to 192px on the long side
// (LEC's original is a small logo in a 450x450 canvas, which would render as a speck). The SVGs
// are copied as they are. `ratio` is width / height of the served file, so a row of icons can
// share one height without any of them being squashed.
//
// `mono: true` marks artwork that is plain black (LCK, CBLOL): it would vanish on the dark UI,
// so it is ALWAYS drawn as a mask in the surrounding text colour. Any icon can be asked to do
// the same with RegionIcon's `mono` prop — the cards do, so the logo matches the card's text.
//
// Keys are the region ids the card database (card.region) and Ultimate Career (REGIONS[].id /
// .league) already use. 'Legacy' and the career's amateur 'ALL' have no logo on purpose.
export const REGION_ICONS = {
    LCK:   { src: '/regions/LCK.svg',   ratio: 1.409, mono: true, name: 'LCK' },
    LPL:   { src: '/regions/LPL.svg',   ratio: 1.655, name: 'LPL' },
    LEC:   { src: '/regions/LEC.png',   ratio: 0.505, name: 'LEC' },
    LCS:   { src: '/regions/LCS.png',   ratio: 0.531, name: 'LCS' },
    LCP:   { src: '/regions/LCP.png',   ratio: 0.708, name: 'LCP' },
    CBLOL: { src: '/regions/CBLOL.png', ratio: 1.412, mono: true, name: 'CBLOL' },
};

export function regionIconFor(region) {
    if (typeof region !== 'string' || !region) return null;
    return REGION_ICONS[region.toUpperCase()] || null;
}
