#!/usr/bin/env node
// ===========================================================================
//  quizCheck -- validates the Game Knowledge question bank (KnowledgeGame)
// ===========================================================================
//  The bank is 100+ hand-written literals and every failure mode it has is
//  SILENT. A duplicated question just shows up twice in a session. A repeated
//  option renders two identical buttons, one of which is scored wrong. A
//  question with three options still plays, it just never offers a fourth.
//  None of it crashes, so nothing else in the repo would ever notice.
//
//  It also enforces the thing that actually decays: the bank is drawn evenly
//  across the five categories (buildRound() takes floor(n / CATS.length) from
//  each), so a category left thin is one that repeats every session while a
//  fat one is barely seen. Depth tiers matter for the same reason.
//
//    node tools/quizCheck.mjs [--list]
//
//  ASCII only.
// ===========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'src', 'lib', 'components', 'career', 'minigames', 'KnowledgeGame.svelte');
const LIST = process.argv.includes('--list');

let bad = 0;
const problems = [];
function ok(label, cond, detail = '') {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  -- ' + detail : ''}`);
    if (!cond) { bad++; problems.push(label + (detail ? ' -- ' + detail : '')); }
}

// ---------------------------------------------------------------------------
//  Pull BANK and CATS out of the component by evaluating just those literals.
//  Parsed rather than duplicated so this file cannot drift from the drill.
// ---------------------------------------------------------------------------
const src = fs.readFileSync(COMPONENT, 'utf8');

function literal(name) {
    const start = src.indexOf(`const ${name} = [`);
    if (start < 0) throw new Error(`quizCheck: could not find \`${name}\` in KnowledgeGame.svelte`);
    const open = src.indexOf('[', start);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error(`quizCheck: \`${name}\` is not a closed array literal`);
    // eslint-disable-next-line no-new-func
    return new Function(`return ${src.slice(open, end + 1)};`)();
}

const CATS = literal('CATS');
const BANK = literal('BANK');
const CAT_IDS = new Set(CATS.map(c => c.id));

console.log('');
console.log('==========================================================');
console.log('  quizCheck -- Game Knowledge question bank');
console.log(`  ${BANK.length} questions across ${CATS.length} categories`);
console.log('==========================================================');
console.log('');

// ---- distribution ---------------------------------------------------------
const byCat = {};
const byTier = {};
for (const q of BANK) {
    byCat[q.c] = (byCat[q.c] || 0) + 1;
    byTier[q.t] = (byTier[q.t] || 0) + 1;
}
console.log('  by category:');
for (const c of CATS) {
    console.log(`    ${c.id.padEnd(10)} ${String(byCat[c.id] || 0).padStart(3)}`);
}
console.log('  by depth tier:');
for (const t of [1, 2, 3]) console.log(`    tier ${t}     ${String(byTier[t] || 0).padStart(3)}`);
console.log('');

if (LIST) {
    for (const c of CATS) {
        console.log(`  ---- ${c.id} ----`);
        for (const q of BANK.filter(x => x.c === c.id)) console.log(`    t${q.t}  ${q.q}`);
    }
    console.log('');
}

console.log('---- ASSERTIONS ------------------------------------------');

// 1. Shape. Everything downstream assumes exactly these fields.
{
    const badShape = [];
    BANK.forEach((q, i) => {
        if (!q || typeof q.q !== 'string' || !q.q.trim()) badShape.push(`#${i} has no question text`);
        else if (!Array.isArray(q.o)) badShape.push(`#${i} has no options array`);
        else if (typeof q.e !== 'string' || !q.e.trim()) badShape.push(`#${i} "${q.q.slice(0, 40)}" has no explanation`);
        else if (!CAT_IDS.has(q.c)) badShape.push(`#${i} "${q.q.slice(0, 40)}" has category "${q.c}"`);
        else if (![1, 2, 3].includes(q.t)) badShape.push(`#${i} "${q.q.slice(0, 40)}" has tier ${q.t}`);
    });
    ok('every question has text, options, an explanation, a real category and a tier 1-3',
        badShape.length === 0, badShape.slice(0, 5).join(' | '));
}

// 2. Exactly four options. The round builder shuffles and renders all of them;
//    three renders a short list and five silently drops nothing but looks odd.
{
    const wrong = BANK.filter(q => !Array.isArray(q.o) || q.o.length !== 4)
        .map(q => `"${q.q.slice(0, 45)}" has ${q.o ? q.o.length : 0}`);
    ok('every question has exactly four options', wrong.length === 0, wrong.slice(0, 5).join(' | '));
}

// 3. No repeated option inside a question. Index 0 is the correct answer, so a
//    duplicate of it is a second correct button that scores as wrong.
{
    const dupes = [];
    for (const q of BANK) {
        if (!Array.isArray(q.o)) continue;
        const seen = new Set();
        for (const o of q.o) {
            const k = String(o).trim().toLowerCase();
            if (seen.has(k)) dupes.push(`"${q.q.slice(0, 45)}" repeats "${o}"`);
            seen.add(k);
        }
    }
    ok('no question repeats an option', dupes.length === 0, dupes.slice(0, 5).join(' | '));
}

// 4. No duplicated question. The bank is hand-written and was nearly doubled in
//    one pass; a repeat is the single most likely mistake in this file.
{
    const seen = new Map();
    const dupes = [];
    for (const q of BANK) {
        const k = String(q.q).trim().toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(k)) dupes.push(`"${q.q.slice(0, 60)}"`);
        seen.set(k, true);
    }
    ok('no question text appears twice', dupes.length === 0, dupes.slice(0, 5).join(' | '));
}

// 5. Two questions may share an ANSWER, but two questions asking the same thing
//    with the same answer are the same question wearing a hat.
{
    const seen = new Map();
    const dupes = [];
    for (const q of BANK) {
        if (!Array.isArray(q.o)) continue;
        const k = q.c + '|' + String(q.o[0]).trim().toLowerCase()
            + '|' + String(q.q).trim().toLowerCase().slice(0, 25);
        if (seen.has(k)) dupes.push(`"${q.q.slice(0, 50)}"`);
        seen.set(k, true);
    }
    ok('no two questions open the same way with the same answer',
        dupes.length === 0, dupes.slice(0, 4).join(' | '));
}

// 6. Enough depth in every category to survive an even draw. An Elite round
//    takes 14 questions, i.e. 2-3 per category; anything under ten means a
//    category starts repeating inside a couple of sessions.
{
    const thin = CATS.filter(c => (byCat[c.id] || 0) < 10).map(c => `${c.id} ${byCat[c.id] || 0}`);
    ok('every category holds at least 10 questions', thin.length === 0, thin.join(', '));
}

// 7. The draw is even, so a category with three times another's depth is
//    wasted writing: most of it is never seen.
{
    const counts = CATS.map(c => byCat[c.id] || 0);
    const ratio = Math.max(...counts) / Math.max(1, Math.min(...counts));
    ok('the deepest category is under 2x the shallowest', ratio < 2.0,
        `${Math.min(...counts)}..${Math.max(...counts)} (ratio ${ratio.toFixed(2)})`);
}

// 8. All three depth tiers are populated. buildRound() prefers a spread of
//    tiers; a missing one quietly makes every round the same difficulty.
{
    const missing = [1, 2, 3].filter(t => (byTier[t] || 0) < 8);
    ok('all three depth tiers have at least 8 questions', missing.length === 0,
        missing.map(t => `tier ${t} has ${byTier[t] || 0}`).join(', '));
}

// 9. The bank must comfortably outrun a single session, or a player sees the
//    same questions the second time they train the attribute.
{
    const biggest = 14;   // CONFIG tier 3 n
    ok('the bank is at least 5x one Elite round', BANK.length >= biggest * 5,
        `${BANK.length} questions vs ${biggest} per round`);
}

// 10. ASCII only, like the rest of this repo -- these strings have been
//     corrupted by encoding round-trips before.
{
    const nonAscii = [];
    for (const q of BANK) {
        for (const s of [q.q, q.e, ...(q.o || [])]) {
            const m = String(s).match(/[^\x00-\x7F]/);
            if (m) nonAscii.push(`"${String(s).slice(0, 40)}" contains ${JSON.stringify(m[0])}`);
        }
    }
    ok('every string is ASCII', nonAscii.length === 0, nonAscii.slice(0, 4).join(' | '));
}

console.log('');
if (bad) {
    console.log(`  ${bad} FAILURE(S)`);
    for (const p of problems) console.log('    - ' + p);
} else {
    console.log(`  All ${BANK.length}-question bank checks passed.`);
}
console.log('');
process.exit(bad ? 1 : 0);
