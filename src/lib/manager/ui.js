// Display helpers for the Ultimate Manager screens. Pure.
import { ratingToQuality, TIER_COLORS } from '../utils/cards.js';
import { CHAMPION_BY_ID, metaFor } from '../career/constants.js';
import { ROLE_BY_ID, PERSONALITY_BY_ID, ATTR_KEYS, CALENDAR, SEASON_PHASE_BY_ID, phaseOfStep } from './data.js';
import { ovrOf, ageOf } from './people.js';
import { fmtMoney, ordinal } from './util.js';

export { fmtMoney, ordinal };

export function ovrColor(v) {
    return TIER_COLORS[ratingToQuality(Math.round(v))] || '#94a3b8';
}

export function champName(id) {
    return (CHAMPION_BY_ID[id] && CHAMPION_BY_ID[id].name) || id || '—';
}

export function metaTag(id, year, split) {
    const t = metaFor(year, split).byId[id] || 0;
    return t > 0 ? 'strong' : t < 0 ? 'weak' : '';
}

export function roleShort(r) {
    return (ROLE_BY_ID[r] && ROLE_BY_ID[r].short) || r;
}

export function persona(p) {
    return PERSONALITY_BY_ID[p && p.pers] || PERSONALITY_BY_ID.professional;
}

export function moraleWord(m) {
    const v = Number(m) || 0;
    if (v >= 82) return { word: 'Delighted', color: '#34d399' };
    if (v >= 68) return { word: 'Happy', color: '#86efac' };
    if (v >= 52) return { word: 'Content', color: '#cbd5e1' };
    if (v >= 38) return { word: 'Unhappy', color: '#fbbf24' };
    return { word: 'Miserable', color: '#f87171' };
}

export function formWord(f) {
    const v = Number(f) || 0;
    if (v >= 2) return { word: 'Hot', arrow: '▲▲', color: '#34d399' };
    if (v >= 1) return { word: 'Good', arrow: '▲', color: '#86efac' };
    if (v <= -2) return { word: 'Cold', arrow: '▼▼', color: '#f87171' };
    if (v <= -1) return { word: 'Poor', arrow: '▼', color: '#fbbf24' };
    return { word: 'Steady', arrow: '–', color: '#94a3b8' };
}

/** A card object for <Card>: real players keep their own card id (and photo). */
export function cardFor(p, team, year) {
    const ovr = ovrOf(p);
    const stats = {};
    for (const k of ATTR_KEYS) stats[k] = Math.round(p.a[k]);
    return {
        id: p.real && p.cid ? p.cid : 'mgr-' + p.id,
        name: p.name,
        role: p.role,
        team: team ? team.short : 'FA',
        year,
        rating: ovr,
        quality: ratingToQuality(ovr),
        region: team ? team.region : (p.reg || p.nat || 'LCK'),
        stats,
    };
}

export function stepName(save) {
    const s = CALENDAR[save.time.step];
    return s ? s.name : '';
}

export function ageLabel(p, year) {
    return ageOf(p, year);
}

export function avgRating(p) {
    return p && p.st && p.st.g ? p.st.rs / p.st.g : null;
}

export function kda(p) {
    if (!p || !p.st || !p.st.g) return '—';
    const d = Math.max(1, p.st.d);
    return ((p.st.k + p.st.as) / d).toFixed(2);
}

/** A chance as a whole percent, never a promise: 1..99. */
export function pct(x) {
    return Math.min(99, Math.max(1, Math.round((Number(x) || 0) * 100)));
}

export const TONE = { good: '#34d399', bad: '#f87171', neutral: '#94a3b8', warn: '#fbbf24' };

/** How each kind of inbox message looks. */
const MSG_KIND = {
    board: { icon: 'briefcase', color: '#60a5fa', label: 'Board' },
    title: { icon: 'trophy', color: '#facc15', label: 'Title' },
    squad: { icon: 'squad', color: '#34d399', label: 'Squad' },
    offer: { icon: 'coins', color: '#fbbf24', label: 'Transfers' },
    event: { icon: 'chat', color: '#f472b6', label: 'Decision' },
    prospect: { icon: 'sparkle', color: '#a3e635', label: 'Prospect' },
    level: { icon: 'star', color: '#c084fc', label: 'Level up' },
    job: { icon: 'briefcase', color: '#22d3ee', label: 'Job offer' },
    contract: { icon: 'quests', color: '#fb923c', label: 'Contracts' },
    achievement: { icon: 'medal', color: '#a78bfa', label: 'Achievement' },
};
export function msgKind(k) {
    return MSG_KIND[k] || { icon: 'chat', color: '#94a3b8', label: 'Message' };
}

/** How each kind of trophy looks in the cabinet. */
export const TROPHY_META = {
    worlds: { name: 'World Championship', short: 'Worlds', icon: 'crown', color: '#facc15' },
    msi: { name: 'Mid-Season Invitational', short: 'MSI', icon: 'globe', color: '#38bdf8' },
    league: { name: 'League title', short: 'League', icon: 'trophy', color: '#fbbf24' },
    tier2: { name: 'Second-tier title', short: 'Tier 2', icon: 'trophy', color: '#cbd5e1' },
    promotion: { name: 'Promotion', short: 'Promotion', icon: 'upgrade', color: '#a78bfa' },
};

/** The stage of the year the calendar is in, for banners and the header pill. */
export function stageOf(save) {
    const step = CALENDAR[save.time.step] || CALENDAR[0];
    const phase = SEASON_PHASE_BY_ID[phaseOfStep(step)] || SEASON_PHASE_BY_ID.preseason;
    return { ...phase, step: step.name, stepShort: step.short, year: save.time.year };
}

/** Colour and icon for a fixture's competition. */
export function compLook(kind) {
    if (kind === 'msi') return { color: '#38bdf8', icon: 'globe' };
    if (kind === 'worlds') return { color: '#facc15', icon: 'crown' };
    if (kind === 'playoffs') return { color: '#fbbf24', icon: 'trophy' };
    if (kind === 'promotion') return { color: '#a78bfa', icon: 'upgrade' };
    return { color: '#34d399', icon: 'calendar' };
}

/** "Ends 2014 (this season)" and a tone for a contract. */
export function contractWord(p, year) {
    const left = (Number(p.until) || year) - year;
    if (p.retiring === year) return { text: `Retiring after ${year}`, tone: 'bad', left };
    if (left <= 0) return { text: p.leaving === year ? `Leaving after ${year}` : `Ends this season (${year})`, tone: p.leaving === year ? 'bad' : 'warn', left };
    if (left === 1) return { text: `Until ${p.until} · 1 more season`, tone: 'neutral', left };
    return { text: `Until ${p.until} · ${left} more seasons`, tone: 'good', left };
}
