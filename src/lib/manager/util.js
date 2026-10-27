// Small pure helpers shared by the manager modules.
import { hash32, mulberry32 } from '../career/constants.js';

export { hash32, mulberry32 };

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round1 = (v) => Math.round(v * 10) / 10;

/** Seeded RNG from any string key. */
export function rngFor(key) {
    return mulberry32(hash32(String(key)));
}

export function pick(rng, list) {
    return list.length ? list[Math.floor(rng() * list.length)] : undefined;
}

export function weightedPick(rng, list, w = (x) => x.weight || 1) {
    let total = 0;
    for (const x of list) total += Math.max(0, w(x));
    if (total <= 0) return list[0];
    let r = rng() * total;
    for (const x of list) {
        r -= Math.max(0, w(x));
        if (r <= 0) return x;
    }
    return list[list.length - 1];
}

export function shuffle(rng, list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Standard normal (Box-Muller). */
export function normal(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

export function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

/** $1.2M / $340K / $900 */
export function fmtMoney(n) {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
    if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
    return `${sign}$${a}`;
}

export function ordinal(n) {
    const v = Math.round(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const m = v % 100;
    return v + (s[(m - 20) % 10] || s[m] || s[0]);
}
