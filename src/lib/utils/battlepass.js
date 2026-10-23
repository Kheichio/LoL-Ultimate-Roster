// The Battle Pass reward track. Lives here rather than in Rewards.svelte so the nav badge
// in Header.svelte counts claimable tiers with exactly the same rules the tab claims with.
//
// SAVE SHAPE: battlePass.claimed is a flat array of tier NUMBERS (a repeatable tier appears
// once per claim). Nothing here may key a claim by anything else, and changing what an
// UNCLAIMED tier pays is safe — a claimed tier is just a number in that list.

export const XP_PER_TIER = 1000;
export const MAX_TIER = 100;

const EXTRA_ICONS = ['🐉','🦊','🐻','🎮','🌊','🔥','❄️','⚡','🌙','☀️','💀','🎪','🏴','🦅','🐺','🦁','🐲','👑','🌟','🎯'];
const EXTRA_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#8b5cf6','#ec4899','#14b8a6','#f43f5e','#6366f1'];

// Free Store packs on the track. They land in the Store's Free Packs row, exactly like RBC
// rewards and codes. Checked first, so each of these tiers is a pack and nothing else — all
// three replaced plain BE tiers, so no cosmetic or skill point moved.
const PACK_TIERS = {
    5:  { pack: 'premium', count: 1, label: 'Premium Pack' },
    35: { pack: 'elite',   count: 1, label: 'Elite Pack' },
    65: { pack: 'elite',   count: 2, label: '2× Elite Pack' },
};

// A second item paid alongside a tier's own reward. Tier 100 keeps its team colour and
// adds the capstone pack on top.
const EXTRAS = {
    100: { type: 'pack', pack: 'champion', count: 1, label: 'Champion Pack' },
};

function build() {
    const rewards = [];
    for (let i = 1; i <= MAX_TIER; i++) {
        if (PACK_TIERS[i]) rewards.push({ tier: i, type: 'pack', ...PACK_TIERS[i] });
        else if (i % 10 === 0 && i <= 50) rewards.push({ tier: i, type: 'sp', amount: 1, label: '1 Skill Point' });
        else if (i === 55 || i === 75) rewards.push({ tier: i, type: 'sp', amount: 1, label: '1 Skill Point' });
        else if (i % 15 === 0) rewards.push({ tier: i, type: 'icon', icon: EXTRA_ICONS[(i / 15 - 1) % EXTRA_ICONS.length], label: 'Team Icon' });
        else if (i % 20 === 0) rewards.push({ tier: i, type: 'color', color: EXTRA_COLORS[(i / 20 - 1) % EXTRA_COLORS.length], label: 'Team Colour' });
        else if (i === 25) rewards.push({ tier: i, type: 'card', tier_q: 'Gold', label: 'Gold Card' });
        else if (i === 70) rewards.push({ tier: i, type: 'card', tier_q: 'Diamond', label: 'Diamond Card' });
        else if (i === 85) rewards.push({ tier: i, type: 'card', tier_q: 'Master', label: 'Master Card' });
        else if (i === 95) rewards.push({ tier: i, type: 'card', tier_q: 'Grandmaster', label: 'Grandmaster Card' });
        else if (i >= 96) {
            const repBE = [500, 800, 1000, 1500, 2000];
            const amount = repBE[(i - 96) % repBE.length];
            rewards.push({ tier: i, type: 'be', amount, label: `${amount} BE`, repeatable: true });
        }
        else rewards.push({ tier: i, type: 'be', amount: 100 + i * 15, label: `${100 + i * 15} BE` });
    }
    for (const r of rewards) if (EXTRAS[r.tier]) r.extra = EXTRAS[r.tier];
    return rewards;
}

export const BP_REWARDS = build();

// "Big" rewards — everything that is not plain Blue Essence. The track draws these larger
// and the jump buttons skip to them.
export function isFeatured(r) {
    return r.type !== 'be';
}

/** A repeatable tier pays once on reaching it and again every 5 tiers after. */
export function repTimesClaimable(reward, tier) {
    if (!reward.repeatable || tier < reward.tier) return 0;
    return Math.floor((tier - reward.tier) / 5) + 1;
}

function claimedCounts(bp) {
    const m = new Map();
    for (const t of (bp && bp.claimed) || []) m.set(t, (m.get(t) || 0) + 1);
    return m;
}

/** How many more times this reward can be claimed right now. */
export function claimsLeft(reward, bp) {
    const tier = (bp && bp.tier) || 0;
    const counts = claimedCounts(bp);
    if (reward.repeatable) return Math.max(0, repTimesClaimable(reward, tier) - (counts.get(reward.tier) || 0));
    return reward.tier <= tier && !counts.has(reward.tier) ? 1 : 0;
}

/** Total claimable rewards — the Rewards nav badge and the Claim All counter. */
export function claimableCount(bp) {
    const tier = (bp && bp.tier) || 0;
    const counts = claimedCounts(bp);
    let n = 0;
    for (const r of BP_REWARDS) {
        if (r.repeatable) n += Math.max(0, repTimesClaimable(r, tier) - (counts.get(r.tier) || 0));
        else if (r.tier <= tier && !counts.has(r.tier)) n++;
    }
    return n;
}
